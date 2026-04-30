"""
AWS S3 storage layer for CDSCO RegAI.

Usage pattern:
  - Input documents → s3://<bucket>/inputs/<job_id>/<filename>
  - Anonymised output → s3://<bucket>/anonymised/<job_id>/anonymised.txt
  - AI results (JSON) → s3://<bucket>/results/<job_id>/<module>.json
  - Inspection reports (TXT) → s3://<bucket>/reports/<job_id>/inspection_report.txt

Why S3:
  - Durable, versioned storage for regulatory documents (audit trail requirement)
  - Pre-signed URLs for secure reviewer access without exposing credentials
  - Lifecycle policies to auto-archive old documents per DPDP retention rules
  - Integration with CDSCO SUGAM portal (future: event-driven pipeline via S3 triggers)
"""
import io
import json
import os
from typing import Optional, Tuple

import boto3
from botocore.exceptions import ClientError, NoCredentialsError


class S3Client:
    def __init__(self, bucket: str, aws_access_key: str, aws_secret_key: str, region: str = "ap-south-1"):
        self.bucket = bucket
        self.region = region
        self._client = boto3.client(
            "s3",
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=region,
        )

    def _ensure_bucket(self):
        try:
            self._client.head_bucket(Bucket=self.bucket)
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                if self.region == "us-east-1":
                    self._client.create_bucket(Bucket=self.bucket)
                else:
                    self._client.create_bucket(
                        Bucket=self.bucket,
                        CreateBucketConfiguration={"LocationConstraint": self.region},
                    )

    def upload_text(self, key: str, content: str, content_type: str = "text/plain") -> bool:
        try:
            self._client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content.encode("utf-8"),
                ContentType=content_type,
                ServerSideEncryption="AES256",   # Encrypt at rest — regulatory requirement
            )
            return True
        except (ClientError, NoCredentialsError):
            return False

    def upload_json(self, key: str, data: dict) -> bool:
        return self.upload_text(key, json.dumps(data, indent=2), "application/json")

    def upload_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> bool:
        try:
            self._client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                ServerSideEncryption="AES256",
            )
            return True
        except (ClientError, NoCredentialsError):
            return False

    def download_text(self, key: str) -> Optional[str]:
        try:
            obj = self._client.get_object(Bucket=self.bucket, Key=key)
            return obj["Body"].read().decode("utf-8")
        except (ClientError, NoCredentialsError):
            return None

    def presigned_url(self, key: str, expiry_seconds: int = 3600) -> Optional[str]:
        """Generate a time-limited pre-signed URL for secure reviewer access."""
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expiry_seconds,
            )
        except (ClientError, NoCredentialsError):
            return None

    def list_job_artifacts(self, job_id: str) -> list:
        try:
            resp = self._client.list_objects_v2(Bucket=self.bucket, Prefix=f"inputs/{job_id}/")
            return [o["Key"] for o in resp.get("Contents", [])]
        except (ClientError, NoCredentialsError):
            return []

    def test_connection(self) -> Tuple[bool, str]:
        try:
            self._client.head_bucket(Bucket=self.bucket)
            return True, f"Connected to s3://{self.bucket} ({self.region})"
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code == "404":
                return False, f"Bucket '{self.bucket}' does not exist"
            return False, f"Access error: {code}"
        except NoCredentialsError:
            return False, "Invalid AWS credentials"


# ── Module-level helpers (used by pages) ──────────────────────────────────

def store_job_artifacts(s3: S3Client, job_id: str, module: str,
                        input_text: str = "", result: dict = None,
                        report_text: str = "", filename: str = "") -> dict:
    """Upload all artifacts for one job. Returns dict of S3 keys."""
    keys = {}

    if input_text:
        k = f"inputs/{job_id}/{filename or 'document.txt'}"
        s3.upload_text(k, input_text)
        keys["input"] = k

    if result:
        k = f"results/{job_id}/{module}.json"
        s3.upload_json(k, result)
        keys["result_json"] = k

    if report_text:
        k = f"reports/{job_id}/{module}_report.txt"
        s3.upload_text(k, report_text)
        keys["result_txt"] = k

    return keys
