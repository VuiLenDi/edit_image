variable "aws_region" {
  description = "AWS region for the private S3 origin."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Lowercase project identifier used in AWS resource names."
  type        = string
  default     = "lop-image-editor"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,18}[a-z0-9]$", var.project_name))
    error_message = "Use 2-20 lowercase letters, digits or hyphens, starting with a letter and ending with a letter or digit."
  }
}

variable "environment" {
  description = "Environment identifier; use separate state for each environment."
  type        = string
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,8}[a-z0-9]$", var.environment))
    error_message = "Use 2-10 lowercase letters, digits or hyphens, starting with a letter and ending with a letter or digit."
  }
}

variable "price_class" {
  description = "CloudFront edge coverage; All includes Southeast Asia edge locations."
  type        = string
  default     = "PriceClass_All"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Choose PriceClass_100, PriceClass_200 or PriceClass_All."
  }
}