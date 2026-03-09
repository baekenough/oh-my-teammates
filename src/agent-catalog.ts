/**
 * Offline catalog of recommendable agents with detection rules.
 * Used by the project analyzer to suggest appropriate agents
 * based on file patterns, config files, and dependencies.
 */

export type AgentCategory =
  | 'language'
  | 'backend'
  | 'frontend'
  | 'data-engineering'
  | 'database'
  | 'infrastructure'
  | 'quality'
  | 'architecture'
  | 'tooling';

export interface DependencyRule {
  /** e.g. "package.json" */
  manifest: string;
  /** Package names to detect in the manifest */
  packages: string[];
  /** Detection confidence score (0.0 - 1.0) */
  confidence: number;
}

export interface AgentCatalogEntry {
  name: string;
  category: AgentCategory;
  description: string;
  detection: {
    fileExtensions?: string[];
    configFiles?: string[];
    directoryPatterns?: string[];
    dependencies?: DependencyRule[];
  };
}

export const AGENT_CATALOG: AgentCatalogEntry[] = [
  // ── Language (6) ────────────────────────────────────────────────────────────
  {
    name: 'lang-typescript-expert',
    category: 'language',
    description: 'TypeScript development',
    detection: {
      fileExtensions: ['.ts', '.tsx'],
      configFiles: ['tsconfig.json'],
      dependencies: [{ manifest: 'package.json', packages: ['typescript'], confidence: 0.9 }],
    },
  },
  {
    name: 'lang-python-expert',
    category: 'language',
    description: 'Python development',
    detection: {
      fileExtensions: ['.py'],
      configFiles: ['pyproject.toml', 'setup.py', 'setup.cfg'],
      dependencies: [{ manifest: 'requirements.txt', packages: [], confidence: 0.7 }],
    },
  },
  {
    name: 'lang-golang-expert',
    category: 'language',
    description: 'Go development',
    detection: {
      fileExtensions: ['.go'],
      configFiles: ['go.mod'],
    },
  },
  {
    name: 'lang-kotlin-expert',
    category: 'language',
    description: 'Kotlin development',
    detection: {
      fileExtensions: ['.kt', '.kts'],
      configFiles: ['build.gradle.kts'],
    },
  },
  {
    name: 'lang-rust-expert',
    category: 'language',
    description: 'Rust development',
    detection: {
      fileExtensions: ['.rs'],
      configFiles: ['Cargo.toml'],
    },
  },
  {
    name: 'lang-java21-expert',
    category: 'language',
    description: 'Java 21 development',
    detection: {
      fileExtensions: ['.java'],
      configFiles: ['pom.xml', 'build.gradle'],
    },
  },

  // ── Backend (6) — higher-priority than language detections ──────────────────
  {
    name: 'be-nestjs-expert',
    category: 'backend',
    description: 'NestJS applications',
    detection: {
      configFiles: ['nest-cli.json'],
      dependencies: [
        {
          manifest: 'package.json',
          packages: ['@nestjs/core', '@nestjs/common'],
          confidence: 0.95,
        },
      ],
    },
  },
  {
    name: 'be-express-expert',
    category: 'backend',
    description: 'Express.js APIs',
    detection: {
      dependencies: [{ manifest: 'package.json', packages: ['express'], confidence: 0.85 }],
    },
  },
  {
    name: 'be-fastapi-expert',
    category: 'backend',
    description: 'FastAPI applications',
    detection: {
      dependencies: [
        { manifest: 'pyproject.toml', packages: ['fastapi'], confidence: 0.95 },
        { manifest: 'requirements.txt', packages: ['fastapi'], confidence: 0.9 },
      ],
    },
  },
  {
    name: 'be-springboot-expert',
    category: 'backend',
    description: 'Spring Boot applications',
    detection: {
      configFiles: ['application.yml', 'application.properties'],
      dependencies: [
        { manifest: 'build.gradle', packages: ['org.springframework.boot'], confidence: 0.95 },
        { manifest: 'pom.xml', packages: ['spring-boot-starter'], confidence: 0.95 },
      ],
    },
  },
  {
    name: 'be-go-backend-expert',
    category: 'backend',
    description: 'Go backend services',
    detection: {
      directoryPatterns: ['cmd/', 'internal/', 'pkg/'],
      dependencies: [
        {
          manifest: 'go.mod',
          packages: [
            'github.com/gin-gonic/gin',
            'github.com/labstack/echo',
            'github.com/gorilla/mux',
            'net/http',
          ],
          confidence: 0.85,
        },
      ],
    },
  },

  // ── Frontend (3) ────────────────────────────────────────────────────────────
  {
    name: 'fe-vercel-agent',
    category: 'frontend',
    description: 'React/Next.js applications',
    detection: {
      configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
      dependencies: [
        { manifest: 'package.json', packages: ['next'], confidence: 0.95 },
        { manifest: 'package.json', packages: ['react', 'react-dom'], confidence: 0.8 },
      ],
    },
  },
  {
    name: 'fe-vuejs-agent',
    category: 'frontend',
    description: 'Vue.js/Nuxt applications',
    detection: {
      configFiles: ['nuxt.config.ts', 'vue.config.js'],
      dependencies: [
        { manifest: 'package.json', packages: ['nuxt'], confidence: 0.95 },
        { manifest: 'package.json', packages: ['vue'], confidence: 0.85 },
      ],
    },
  },
  {
    name: 'fe-svelte-agent',
    category: 'frontend',
    description: 'SvelteKit applications',
    detection: {
      configFiles: ['svelte.config.js', 'svelte.config.ts'],
      dependencies: [
        { manifest: 'package.json', packages: ['svelte', '@sveltejs/kit'], confidence: 0.95 },
      ],
    },
  },

  // ── Data Engineering (6) ────────────────────────────────────────────────────
  {
    name: 'de-airflow-expert',
    category: 'data-engineering',
    description: 'Apache Airflow',
    detection: {
      directoryPatterns: ['dags/'],
      configFiles: ['airflow.cfg'],
      dependencies: [
        { manifest: 'requirements.txt', packages: ['apache-airflow'], confidence: 0.95 },
        { manifest: 'pyproject.toml', packages: ['apache-airflow'], confidence: 0.95 },
      ],
    },
  },
  {
    name: 'de-dbt-expert',
    category: 'data-engineering',
    description: 'dbt analytics',
    detection: {
      configFiles: ['dbt_project.yml', 'profiles.yml'],
      directoryPatterns: ['models/'],
    },
  },
  {
    name: 'de-spark-expert',
    category: 'data-engineering',
    description: 'Apache Spark',
    detection: {
      dependencies: [
        { manifest: 'requirements.txt', packages: ['pyspark'], confidence: 0.9 },
        { manifest: 'build.gradle', packages: ['org.apache.spark'], confidence: 0.9 },
      ],
    },
  },
  {
    name: 'de-kafka-expert',
    category: 'data-engineering',
    description: 'Apache Kafka',
    detection: {
      dependencies: [
        { manifest: 'package.json', packages: ['kafkajs', 'kafka-node'], confidence: 0.9 },
        {
          manifest: 'requirements.txt',
          packages: ['kafka-python', 'confluent-kafka'],
          confidence: 0.9,
        },
      ],
    },
  },
  {
    name: 'de-snowflake-expert',
    category: 'data-engineering',
    description: 'Snowflake data warehouse',
    detection: {
      dependencies: [
        {
          manifest: 'requirements.txt',
          packages: ['snowflake-connector-python', 'snowflake-sqlalchemy'],
          confidence: 0.9,
        },
        { manifest: 'package.json', packages: ['snowflake-sdk'], confidence: 0.9 },
      ],
    },
  },
  {
    name: 'de-pipeline-expert',
    category: 'data-engineering',
    description: 'Data pipeline architecture',
    detection: {
      directoryPatterns: ['pipelines/', 'etl/'],
      dependencies: [
        {
          manifest: 'requirements.txt',
          packages: ['prefect', 'dagster', 'luigi'],
          confidence: 0.85,
        },
      ],
    },
  },

  // ── Database (3) ────────────────────────────────────────────────────────────
  {
    name: 'db-postgres-expert',
    category: 'database',
    description: 'PostgreSQL',
    detection: {
      configFiles: ['postgresql.conf'],
      directoryPatterns: ['migrations/', 'schema/'],
      dependencies: [
        {
          manifest: 'package.json',
          packages: ['pg', 'knex', 'typeorm', 'prisma', '@prisma/client', 'drizzle-orm'],
          confidence: 0.8,
        },
        {
          manifest: 'requirements.txt',
          packages: ['psycopg2', 'asyncpg', 'sqlalchemy'],
          confidence: 0.8,
        },
      ],
    },
  },
  {
    name: 'db-supabase-expert',
    category: 'database',
    description: 'Supabase + PostgreSQL',
    detection: {
      configFiles: ['supabase/config.toml'],
      directoryPatterns: ['supabase/'],
      dependencies: [
        { manifest: 'package.json', packages: ['@supabase/supabase-js'], confidence: 0.95 },
      ],
    },
  },
  {
    name: 'db-redis-expert',
    category: 'database',
    description: 'Redis',
    detection: {
      dependencies: [
        {
          manifest: 'package.json',
          packages: ['redis', 'ioredis', 'bull', 'bullmq'],
          confidence: 0.85,
        },
        {
          manifest: 'requirements.txt',
          packages: ['redis', 'aioredis', 'celery'],
          confidence: 0.85,
        },
      ],
    },
  },

  // ── Infrastructure (2) ──────────────────────────────────────────────────────
  {
    name: 'infra-docker-expert',
    category: 'infrastructure',
    description: 'Docker containerization',
    detection: {
      configFiles: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore'],
    },
  },
  {
    name: 'infra-aws-expert',
    category: 'infrastructure',
    description: 'AWS architecture',
    detection: {
      configFiles: ['cdk.json', 'samconfig.toml'],
      directoryPatterns: ['terraform/', 'cdk/', 'cloudformation/'],
      dependencies: [
        {
          manifest: 'package.json',
          packages: ['aws-cdk-lib', '@aws-sdk/client-s3', 'aws-sdk'],
          confidence: 0.85,
        },
        { manifest: 'requirements.txt', packages: ['boto3', 'aws-cdk-lib'], confidence: 0.85 },
      ],
    },
  },

  // ── Quality (3) ─────────────────────────────────────────────────────────────
  {
    name: 'qa-planner',
    category: 'quality',
    description: 'Test strategy planning',
    detection: {
      configFiles: [
        'jest.config.ts',
        'jest.config.js',
        'vitest.config.ts',
        'cypress.config.ts',
        'playwright.config.ts',
      ],
      directoryPatterns: ['__tests__/', 'test/', 'tests/', 'cypress/', 'e2e/'],
    },
  },
  {
    name: 'qa-writer',
    category: 'quality',
    description: 'Test documentation',
    detection: {}, // Triggered by qa-planner + test presence
  },
  {
    name: 'qa-engineer',
    category: 'quality',
    description: 'Test execution',
    detection: {}, // Triggered by qa-planner + test presence
  },

  // ── Architecture (2) ────────────────────────────────────────────────────────
  {
    name: 'arch-documenter',
    category: 'architecture',
    description: 'Architecture documentation',
    detection: {
      directoryPatterns: ['docs/', 'architecture/'],
      configFiles: ['mkdocs.yml', 'docusaurus.config.js'],
    },
  },
  {
    name: 'arch-speckit-agent',
    category: 'architecture',
    description: 'Spec-driven development',
    detection: {
      directoryPatterns: ['specs/'],
      configFiles: ['spec.yaml'],
    },
  },

  // ── Tooling (3) ─────────────────────────────────────────────────────────────
  {
    name: 'tool-npm-expert',
    category: 'tooling',
    description: 'npm package management',
    detection: {
      configFiles: ['package.json', '.npmrc', '.npmignore'],
    },
  },
  {
    name: 'tool-bun-expert',
    category: 'tooling',
    description: 'Bun runtime',
    detection: {
      configFiles: ['bunfig.toml', 'bun.lock'],
    },
  },
  {
    name: 'tool-optimizer',
    category: 'tooling',
    description: 'Bundle optimization',
    detection: {
      configFiles: ['webpack.config.js', 'rollup.config.js', 'esbuild.config.js'],
    },
  },
];

/** Return all catalog entries belonging to the given category. */
export function getCatalogByCategory(category: AgentCategory): AgentCatalogEntry[] {
  return AGENT_CATALOG.filter((a) => a.category === category);
}

/** Return the catalog entry for the given agent name, or undefined if not found. */
export function getCatalogEntry(name: string): AgentCatalogEntry | undefined {
  return AGENT_CATALOG.find((a) => a.name === name);
}

/** Return deduplicated list of all categories present in the catalog. */
export function getAllCategories(): AgentCategory[] {
  return [...new Set(AGENT_CATALOG.map((a) => a.category))];
}
