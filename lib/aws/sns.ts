import {
  SNSClient,
  PublishCommand,
  CreateSMSSandboxPhoneNumberCommand,
  ListSMSSandboxPhoneNumbersCommand,
  VerifySMSSandboxPhoneNumberCommand,
  type PublishCommandInput,
} from '@aws-sdk/client-sns';
import { toIndiaPhone } from '@/lib/phone';

const sns = new SNSClient({ region: process.env.SNS_REGION ?? 'ap-south-1' });

export function normalizePhoneNumber(phoneNumber: string): string {
  return toIndiaPhone(phoneNumber);
}

export async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  // Phone number must be in E.164 format: +91XXXXXXXXXX
  const normalized = normalizePhoneNumber(phoneNumber);
  const input: PublishCommandInput = {
    PhoneNumber: normalized,
    Message: message,
    MessageAttributes: {
      'AWS.SNS.SMS.SenderID': {
        DataType: 'String',
        StringValue: 'FARMADV',
      },
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: 'Transactional',
      },
    },
  };
  await sns.send(new PublishCommand(input));
}

export async function sendPhoneVerificationOtp(phoneNumber: string): Promise<void> {
  await sns.send(new CreateSMSSandboxPhoneNumberCommand({
    PhoneNumber: normalizePhoneNumber(phoneNumber),
    LanguageCode: 'en-US',
  }));
}

export async function getPhoneVerificationStatus(phoneNumber: string): Promise<string | null> {
  const normalized = normalizePhoneNumber(phoneNumber);
  let nextToken: string | undefined;

  do {
    const result = await sns.send(new ListSMSSandboxPhoneNumbersCommand({
      NextToken: nextToken,
    }));
    const match = result.PhoneNumbers?.find((item) => item.PhoneNumber === normalized);
    if (match?.Status) return match.Status;
    nextToken = result.NextToken;
  } while (nextToken);

  return null;
}

export async function verifyPhoneVerificationOtp(phoneNumber: string, otp: string): Promise<void> {
  await sns.send(new VerifySMSSandboxPhoneNumberCommand({
    PhoneNumber: normalizePhoneNumber(phoneNumber),
    OneTimePassword: otp,
  }));
}

export async function sendWeatherAlert(
  phoneNumber: string,
  alertMessage: string
): Promise<void> {
  return sendSMS(phoneNumber, `[FarmAdvisor Weather Alert] ${alertMessage}`);
}

export async function sendMilestoneReminder(
  phoneNumber: string,
  reminderMessage: string
): Promise<void> {
  return sendSMS(phoneNumber, `[FarmAdvisor Reminder] ${reminderMessage}`);
}
