terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.0"
    }
  }

  # Using local backend - state will be stored in terraform.tfstate in this directory
  # This is automatically gitignored for security
}

provider "aws" {
  region = var.aws_region
}

# Data source for current caller identity
data "aws_caller_identity" "current" {}

# Get current public IP for dev-only DB access
# NOTE: this will open PostgreSQL to YOUR current IP (/32). Do not use in production.
data "http" "myip" {
  url = "https://checkip.amazonaws.com/"
}

# ========================================
# Database (RDS Instance) + Secrets Manager
# Keeping original names (aurora-*)
# ========================================

# Random password for database
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "random_id" "suffix" {
  byte_length = 4
}

# Secrets Manager secret for database credentials (same name pattern as original)
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "alex-aurora-credentials-${random_id.suffix.hex}"
  recovery_window_in_days = 0 # For development - immediate deletion

  tags = {
    Project = "alex"
    Part    = "5"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db_password.result
  })
}

# DB Subnet Group (using default VPC) - keep same resource/name
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "aurora" {
  name       = "alex-aurora-subnet-group"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Project = "alex"
    Part    = "5"
  }
}

# Security group for DB - keep same resource/name
resource "aws_security_group" "aurora" {
  name        = "alex-aurora-sg"
  description = "Security group for Alex database (RDS instance; replaces Aurora cluster)"
  vpc_id      = data.aws_vpc.default.id

  # PostgreSQL
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["${chomp(data.http.myip.response_body)}/32"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project = "alex"
    Part    = "5"
  }
}

# ========================================
# RDS PostgreSQL Instance (replaces aws_rds_cluster/aws_rds_cluster_instance)
# Keeping resource name "aurora" to avoid breaking references/outputs
# ========================================
resource "aws_db_instance" "aurora" {
  # Keep the external identifier name to match original cluster identifier
  identifier = "alex-aurora-cluster"

  engine         = "postgres"
  engine_version = var.db_engine_version

  db_name  = "alex"
  username = var.db_username
  password = random_password.db_password.result

  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"

  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  publicly_accessible = true

  # Development settings
  skip_final_snapshot = true
  deletion_protection = false
  apply_immediately   = true

  tags = {
    Project = "alex"
    Part    = "5"
  }
}

# ========================================
# IAM role for Lambda (kept name)
# Note: Aurora Data API is NOT available on standard RDS instances.
# ========================================
resource "aws_iam_role" "lambda_aurora_role" {
  name = "alex-lambda-aurora-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project = "alex"
    Part    = "5"
  }
}

resource "aws_iam_role_policy" "lambda_aurora_policy" {
  name = "alex-lambda-aurora-policy"
  role = aws_iam_role.lambda_aurora_role.id

  # Removed rds-data:* actions (Data API) because RDS instance doesn't support it
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.db_credentials.arn
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_aurora_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
