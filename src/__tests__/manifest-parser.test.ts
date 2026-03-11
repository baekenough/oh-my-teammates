import { describe, expect, it } from 'bun:test';
import {
  parseBuildGradle,
  parseCargoToml,
  parseGoMod,
  parseManifest,
  parsePackageJson,
  parsePomXml,
  parsePubspecYaml,
  parsePyprojectToml,
  parseRequirementsTxt,
} from '../manifest-parser';

// ── parsePackageJson ─────────────────────────────────────────────────────────

describe('parsePackageJson', () => {
  it('parses dependencies and devDependencies correctly', () => {
    const content = JSON.stringify({
      dependencies: { react: '^18.0.0', axios: '^1.0.0' },
      devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
    });
    const result = parsePackageJson(content);
    expect(result.manifest).toBe('package.json');
    expect(result.packages).toContain('react');
    expect(result.packages).toContain('axios');
    expect(result.devPackages).toContain('typescript');
    expect(result.devPackages).toContain('vitest');
    expect(result.packages).not.toContain('typescript');
  });

  it('handles peerDependencies by including them in packages', () => {
    const content = JSON.stringify({
      dependencies: { react: '^18.0.0' },
      peerDependencies: { 'react-dom': '^18.0.0' },
      devDependencies: { jest: '^29.0.0' },
    });
    const result = parsePackageJson(content);
    expect(result.packages).toContain('react');
    expect(result.packages).toContain('react-dom');
    expect(result.devPackages).toContain('jest');
  });

  it('returns empty result for invalid JSON', () => {
    const result = parsePackageJson('{ not valid json }');
    expect(result.manifest).toBe('package.json');
    expect(result.packages).toHaveLength(0);
    expect(result.devPackages).toHaveLength(0);
  });

  it('returns empty for empty object', () => {
    const result = parsePackageJson('{}');
    expect(result.packages).toHaveLength(0);
    expect(result.devPackages).toHaveLength(0);
  });

  it('returns empty when JSON is an array (not an object)', () => {
    const result = parsePackageJson('[{"name": "react"}]');
    expect(result.packages).toHaveLength(0);
    expect(result.devPackages).toHaveLength(0);
  });

  it('returns empty when JSON is null', () => {
    const result = parsePackageJson('null');
    expect(result.packages).toHaveLength(0);
    expect(result.devPackages).toHaveLength(0);
  });

  it('deduplicates packages that appear in multiple sections', () => {
    const content = JSON.stringify({
      dependencies: { react: '^18.0.0' },
      peerDependencies: { react: '^18.0.0' },
    });
    const result = parsePackageJson(content);
    const reactCount = result.packages.filter((p) => p === 'react').length;
    expect(reactCount).toBe(1);
  });
});

// ── parseGoMod ───────────────────────────────────────────────────────────────

describe('parseGoMod', () => {
  it('parses require block with multiple modules', () => {
    const content = `module github.com/example/app

go 1.21

require (
    github.com/gin-gonic/gin v1.9.0
    github.com/stretchr/testify v1.8.0
    golang.org/x/net v0.0.0-20230601000000-00000000
)
`;
    const result = parseGoMod(content);
    expect(result.manifest).toBe('go.mod');
    expect(result.packages).toContain('github.com/gin-gonic/gin');
    expect(result.packages).toContain('github.com/stretchr/testify');
    expect(result.packages).toContain('golang.org/x/net');
    expect(result.devPackages).toHaveLength(0);
  });

  it('parses single-line require statement', () => {
    const content = `module github.com/example/app

go 1.21

require github.com/labstack/echo v4.11.0
`;
    const result = parseGoMod(content);
    expect(result.packages).toContain('github.com/labstack/echo');
  });

  it('handles comments and indirect deps in require block', () => {
    const content = `module example.com/app

go 1.21

require (
    // this is a comment
    github.com/foo/bar v1.0.0
    github.com/baz/qux v2.0.0 // indirect
)
`;
    const result = parseGoMod(content);
    expect(result.packages).toContain('github.com/foo/bar');
    expect(result.packages).toContain('github.com/baz/qux');
    expect(result.packages).not.toContain('// this is a comment');
  });

  it('returns empty packages for empty file', () => {
    const result = parseGoMod('');
    expect(result.packages).toHaveLength(0);
    expect(result.devPackages).toHaveLength(0);
  });

  it('ignores lines inside require block that do not have version prefix', () => {
    // A line with only one token (no version starting with v) should be skipped
    const content = `module example.com/app

go 1.21

require (
    github.com/foo/bar v1.0.0
    notamodule
)
`;
    const result = parseGoMod(content);
    expect(result.packages).toContain('github.com/foo/bar');
    expect(result.packages).not.toContain('notamodule');
  });
});

// ── parsePyprojectToml ───────────────────────────────────────────────────────

describe('parsePyprojectToml', () => {
  it('parses [project] dependencies', () => {
    const content = `[project]
name = "my-app"
dependencies = [
    "fastapi>=0.100.0",
    "pydantic>=2.0",
    "httpx",
]
`;
    const result = parsePyprojectToml(content);
    expect(result.manifest).toBe('pyproject.toml');
    expect(result.packages).toContain('fastapi');
    expect(result.packages).toContain('pydantic');
    expect(result.packages).toContain('httpx');
  });

  it('handles optional-dependencies as devPackages', () => {
    const content = `[project]
name = "my-app"
dependencies = ["requests"]

[project.optional-dependencies]
dev = ["pytest>=7.0", "mypy"]
docs = ["sphinx"]
`;
    const result = parsePyprojectToml(content);
    expect(result.packages).toContain('requests');
    expect(result.devPackages).toContain('pytest');
    expect(result.devPackages).toContain('mypy');
    expect(result.devPackages).toContain('sphinx');
  });

  it('strips version specifiers from package names', () => {
    const content = `[project]
dependencies = [
    "fastapi>=0.100.0",
    "sqlalchemy~=2.0",
    "redis[hiredis]>=4.0",
]
`;
    const result = parsePyprojectToml(content);
    expect(result.packages).toContain('fastapi');
    expect(result.packages).toContain('sqlalchemy');
    expect(result.packages).toContain('redis');
    expect(result.packages.some((p) => p.includes('>') || p.includes('~'))).toBe(false);
  });

  it('returns empty for missing [project] section', () => {
    const content = `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`;
    const result = parsePyprojectToml(content);
    expect(result.packages).toHaveLength(0);
  });

  it('returns empty packages when [project] has no dependencies key', () => {
    const content = `[project]
name = "my-app"
version = "1.0.0"
`;
    const result = parsePyprojectToml(content);
    expect(result.packages).toHaveLength(0);
  });

  it('returns empty when dependencies array is malformed (unclosed bracket)', () => {
    // Unclosed bracket — extractTomlStringArray should return []
    const content = `[project]
dependencies = [
    "fastapi",
    "pydantic"
`;
    // Should not throw, may return empty
    const result = parsePyprojectToml(content);
    expect(Array.isArray(result.packages)).toBe(true);
  });

  it('handles nested array in dependencies gracefully', () => {
    // Dependencies with nested brackets inside quoted strings
    const content = `[project]
dependencies = [
    "redis[hiredis]>=4.0",
    "fastapi",
]
`;
    const result = parsePyprojectToml(content);
    expect(result.packages).toContain('fastapi');
    expect(result.packages).toContain('redis');
  });

  it('handles literal nested array brackets outside quotes', () => {
    // Actual nested bracket structure (depth++ path)
    const content = `[project]
dependencies = [
    ["group1", "group2"],
    "fastapi",
]
`;
    // Should not throw and should process as best effort
    const result = parsePyprojectToml(content);
    expect(Array.isArray(result.packages)).toBe(true);
    expect(result.packages).toContain('fastapi');
  });
});

// ── parseRequirementsTxt ─────────────────────────────────────────────────────

describe('parseRequirementsTxt', () => {
  it('parses simple package list', () => {
    const content = `flask
requests
sqlalchemy
`;
    const result = parseRequirementsTxt(content);
    expect(result.manifest).toBe('requirements.txt');
    expect(result.packages).toContain('flask');
    expect(result.packages).toContain('requests');
    expect(result.packages).toContain('sqlalchemy');
  });

  it('strips version specifiers', () => {
    const content = `flask==2.3.0
requests>=2.28.0
sqlalchemy~=2.0.0
celery!=5.0.0
`;
    const result = parseRequirementsTxt(content);
    expect(result.packages).toContain('flask');
    expect(result.packages).toContain('requests');
    expect(result.packages).toContain('sqlalchemy');
    expect(result.packages).toContain('celery');
    expect(result.packages.some((p) => p.includes('=') || p.includes('>'))).toBe(false);
  });

  it('ignores comments and blank lines', () => {
    const content = `# This is a comment
flask==2.3.0

# Another comment
requests>=2.28.0
`;
    const result = parseRequirementsTxt(content);
    expect(result.packages).toContain('flask');
    expect(result.packages).toContain('requests');
    expect(result.packages).not.toContain('');
    expect(result.packages.some((p) => p.startsWith('#'))).toBe(false);
  });

  it('ignores -r and -e directives', () => {
    const content = `-r base.txt
-e git+https://github.com/example/package.git
flask==2.3.0
--index-url https://pypi.org/simple
`;
    const result = parseRequirementsTxt(content);
    expect(result.packages).toContain('flask');
    expect(result.packages.some((p) => p.startsWith('-'))).toBe(false);
    expect(result.packages.some((p) => p.includes('git+'))).toBe(false);
  });
});

// ── parseCargoToml ───────────────────────────────────────────────────────────

describe('parseCargoToml', () => {
  it('parses [dependencies] section', () => {
    const content = `[package]
name = "my-app"
version = "0.1.0"

[dependencies]
serde = "1.0"
tokio = { version = "1.0", features = ["full"] }
reqwest = "0.11"
`;
    const result = parseCargoToml(content);
    expect(result.manifest).toBe('Cargo.toml');
    expect(result.packages).toContain('serde');
    expect(result.packages).toContain('tokio');
    expect(result.packages).toContain('reqwest');
  });

  it('parses [dev-dependencies] as devPackages', () => {
    const content = `[dependencies]
serde = "1.0"

[dev-dependencies]
mockito = "1.0"
criterion = "0.5"
`;
    const result = parseCargoToml(content);
    expect(result.packages).toContain('serde');
    expect(result.devPackages).toContain('mockito');
    expect(result.devPackages).toContain('criterion');
    expect(result.packages).not.toContain('mockito');
  });

  it('handles inline table format', () => {
    const content = `[dependencies]
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
`;
    const result = parseCargoToml(content);
    expect(result.packages).toContain('tokio');
    expect(result.packages).toContain('serde');
  });
});

// ── parseBuildGradle ─────────────────────────────────────────────────────────

describe('parseBuildGradle', () => {
  it('parses implementation("group:artifact:version") Kotlin DSL style', () => {
    const content = `plugins {
    id("org.springframework.boot") version "3.1.0"
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web:3.1.0")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.15.0")
}
`;
    const result = parseBuildGradle(content);
    expect(result.manifest).toBe('build.gradle');
    expect(result.packages).toContain('org.springframework.boot');
    expect(result.packages).toContain('com.fasterxml.jackson.core');
  });

  it('parses Groovy DSL style without parentheses', () => {
    const content = `dependencies {
    implementation 'com.example:library:1.0.0'
    api 'org.apache.commons:commons-lang3:3.12.0'
}
`;
    const result = parseBuildGradle(content);
    expect(result.packages).toContain('com.example');
    expect(result.packages).toContain('org.apache.commons');
  });

  it('separates testImplementation to devPackages', () => {
    const content = `dependencies {
    implementation("org.springframework.boot:spring-boot-starter:3.1.0")
    testImplementation("org.springframework.boot:spring-boot-starter-test:3.1.0")
    testImplementation("org.junit.jupiter:junit-jupiter:5.9.0")
}
`;
    const result = parseBuildGradle(content);
    expect(result.packages).toContain('org.springframework.boot');
    expect(result.devPackages).toContain('org.junit.jupiter');
    expect(result.packages).not.toContain('org.junit.jupiter');
  });
});

// ── parsePomXml ──────────────────────────────────────────────────────────────

describe('parsePomXml', () => {
  it('parses dependency groupId', () => {
    const content = `<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
    </dependency>
  </dependencies>
</project>
`;
    const result = parsePomXml(content);
    expect(result.manifest).toBe('pom.xml');
    expect(result.packages).toContain('org.springframework.boot');
    expect(result.packages).toContain('com.fasterxml.jackson.core');
  });

  it('separates test scope to devPackages', () => {
    const content = `<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter</artifactId>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.mockito</groupId>
      <artifactId>mockito-core</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
`;
    const result = parsePomXml(content);
    expect(result.packages).toContain('org.springframework.boot');
    expect(result.devPackages).toContain('org.junit.jupiter');
    expect(result.devPackages).toContain('org.mockito');
    expect(result.packages).not.toContain('org.junit.jupiter');
  });
});

// ── parsePubspecYaml ─────────────────────────────────────────────────────────

describe('parsePubspecYaml', () => {
  it('parses dependencies and dev_dependencies correctly', () => {
    const content = `name: my_app
dependencies:
  flutter:
    sdk: flutter
  http: ^0.13.0
  provider: ^6.0.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^2.0.0
`;
    const result = parsePubspecYaml(content);
    expect(result.manifest).toBe('pubspec.yaml');
    expect(result.packages).toContain('http');
    expect(result.packages).toContain('provider');
    expect(result.devPackages).toContain('flutter_lints');
  });

  it('excludes SDK dependencies from packages and devPackages', () => {
    const content = `name: my_app
dependencies:
  flutter:
    sdk: flutter
  http: ^0.13.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  mockito: ^5.0.0
`;
    const result = parsePubspecYaml(content);
    expect(result.packages).not.toContain('flutter');
    expect(result.devPackages).not.toContain('flutter_test');
    expect(result.packages).toContain('http');
    expect(result.devPackages).toContain('mockito');
  });

  it('returns empty result for empty pubspec', () => {
    const result = parsePubspecYaml('');
    expect(result.manifest).toBe('pubspec.yaml');
    expect(result.packages).toHaveLength(0);
    expect(result.devPackages).toHaveLength(0);
  });

  it('handles pubspec with only dependencies (no dev_dependencies)', () => {
    const content = `name: my_app
dependencies:
  http: ^0.13.0
  dio: ^5.0.0
`;
    const result = parsePubspecYaml(content);
    expect(result.packages).toContain('http');
    expect(result.packages).toContain('dio');
    expect(result.devPackages).toHaveLength(0);
  });

  it('handles pubspec with only dev_dependencies (no dependencies)', () => {
    const content = `name: my_app
dev_dependencies:
  flutter_lints: ^2.0.0
  build_runner: ^2.0.0
`;
    const result = parsePubspecYaml(content);
    expect(result.packages).toHaveLength(0);
    expect(result.devPackages).toContain('flutter_lints');
    expect(result.devPackages).toContain('build_runner');
  });

  it('returns empty result for invalid YAML', () => {
    const result = parsePubspecYaml('{ this: is: not: valid: yaml: [');
    expect(result.manifest).toBe('pubspec.yaml');
    expect(result.packages).toHaveLength(0);
    expect(result.devPackages).toHaveLength(0);
  });
});

// ── parseManifest dispatcher ─────────────────────────────────────────────────

describe('parseManifest', () => {
  it('routes package.json to parsePackageJson', () => {
    const content = JSON.stringify({ dependencies: { react: '^18.0.0' } });
    const result = parseManifest('package.json', content);
    expect(result).not.toBeNull();
    expect(result?.manifest).toBe('package.json');
    expect(result?.packages).toContain('react');
  });

  it('routes go.mod to parseGoMod', () => {
    const content = `module example.com/app\n\nrequire github.com/gin-gonic/gin v1.9.0\n`;
    const result = parseManifest('go.mod', content);
    expect(result?.manifest).toBe('go.mod');
    expect(result?.packages).toContain('github.com/gin-gonic/gin');
  });

  it('routes pyproject.toml to parsePyprojectToml', () => {
    const content = `[project]\ndependencies = ["fastapi"]\n`;
    const result = parseManifest('pyproject.toml', content);
    expect(result?.manifest).toBe('pyproject.toml');
  });

  it('routes requirements.txt to parseRequirementsTxt', () => {
    const content = 'flask==2.3.0\n';
    const result = parseManifest('requirements.txt', content);
    expect(result?.manifest).toBe('requirements.txt');
    expect(result?.packages).toContain('flask');
  });

  it('routes Cargo.toml to parseCargoToml', () => {
    const content = `[dependencies]\nserde = "1.0"\n`;
    const result = parseManifest('Cargo.toml', content);
    expect(result?.manifest).toBe('Cargo.toml');
  });

  it('routes build.gradle to parseBuildGradle', () => {
    const content = `dependencies {\n    implementation("com.example:lib:1.0")\n}\n`;
    const result = parseManifest('build.gradle', content);
    expect(result?.manifest).toBe('build.gradle');
  });

  it('routes build.gradle.kts to parseBuildGradle', () => {
    const content = `dependencies {\n    implementation("com.example:lib:1.0")\n}\n`;
    const result = parseManifest('build.gradle.kts', content);
    expect(result?.manifest).toBe('build.gradle');
  });

  it('routes pom.xml to parsePomXml', () => {
    const content = `<project><dependencies><dependency><groupId>org.spring</groupId></dependency></dependencies></project>`;
    const result = parseManifest('pom.xml', content);
    expect(result?.manifest).toBe('pom.xml');
  });

  it('routes pubspec.yaml to parsePubspecYaml', () => {
    const content = `name: my_app\ndependencies:\n  http: ^0.13.0\n`;
    const result = parseManifest('pubspec.yaml', content);
    expect(result?.manifest).toBe('pubspec.yaml');
    expect(result?.packages).toContain('http');
  });

  it('returns null for unknown filename', () => {
    const result = parseManifest('unknown-file.txt', 'some content');
    expect(result).toBeNull();
  });

  it('returns null for unrecognized extension', () => {
    const result = parseManifest('Makefile', 'all:\n\techo hello');
    expect(result).toBeNull();
  });

  it('handles path prefix correctly and routes by basename', () => {
    const content = JSON.stringify({ dependencies: { lodash: '^4.0.0' } });
    const result = parseManifest('/some/nested/path/package.json', content);
    expect(result?.manifest).toBe('package.json');
    expect(result?.packages).toContain('lodash');
  });
});
