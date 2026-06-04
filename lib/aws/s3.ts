import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });
const mediaBucket = process.env.S3_BUCKET_MEDIA ?? 'farm-advisor-media';

export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  bucket = mediaBucket
): Promise<string> {
  const input: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  };
  await s3.send(new PutObjectCommand(input));
  return key;
}

export async function getPresignedUrl(key: string, bucket = mediaBucket, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
  bucket = mediaBucket,
  expiresIn = 300
): Promise<string> {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn });
}

export function buildS3Key(farmerId: string, type: 'land' | 'soil' | 'crop', filename: string): string {
  return `${farmerId}/${type}/${Date.now()}-${filename}`;
}
