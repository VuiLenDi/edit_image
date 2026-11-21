mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }
}

mock_provider "aws" {
  alias = "us_east_1"

  mock_data "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
    }
  }
}

run "private_https_site" {
  command = plan

  assert {
    condition = (
      aws_s3_bucket_public_access_block.site.block_public_acls &&
      aws_s3_bucket_public_access_block.site.block_public_policy &&
      aws_s3_bucket_public_access_block.site.ignore_public_acls &&
      aws_s3_bucket_public_access_block.site.restrict_public_buckets
    )
    error_message = "The origin bucket must block all public access."
  }

  assert {
    condition     = !aws_s3_bucket.site.force_destroy
    error_message = "Destroy must not silently delete deployed files."
  }

  assert {
    condition     = aws_s3_bucket.site.bucket == "lop-image-editor-dev-123456789012"
    error_message = "Bucket names must include the environment and AWS account."
  }

  assert {
    condition     = aws_s3_bucket_ownership_controls.site.rule[0].object_ownership == "BucketOwnerEnforced"
    error_message = "Object ACLs must be disabled."
  }

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.site.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256"
    error_message = "S3 objects must be encrypted at rest."
  }

  assert {
    condition     = aws_cloudfront_origin_access_control.site.signing_behavior == "always" && aws_cloudfront_origin_access_control.site.signing_protocol == "sigv4"
    error_message = "CloudFront must sign every origin request."
  }

  assert {
    condition     = aws_cloudfront_distribution.site.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "Viewers must be redirected to HTTPS."
  }

  assert {
    condition     = aws_cloudfront_distribution.site.default_root_object == "index.html"
    error_message = "The Vite entry point must be the default document."
  }

  assert {
    condition = (
      contains(aws_cloudfront_distribution.site.aliases, "editimg.vuilendi.com") &&
      aws_cloudfront_distribution.site.viewer_certificate[0].minimum_protocol_version == "TLSv1.2_2021" &&
      aws_cloudfront_distribution.site.viewer_certificate[0].acm_certificate_arn == "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
    )
    error_message = "CloudFront must retain the custom domain and its modern ACM-backed TLS certificate."
  }

  assert {
    condition     = aws_cloudfront_cache_policy.site.min_ttl == 0
    error_message = "Cache policy must respect no-cache headers on index.html."
  }
}

run "reject_invalid_project_name" {
  command = plan

  variables {
    project_name = "Invalid_Name"
  }

  expect_failures = [var.project_name]
}