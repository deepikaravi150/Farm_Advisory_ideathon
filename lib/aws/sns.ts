import { SNSClient, PublishCommand, type PublishCommandInput } from '@aws-sdk/client-sns';

const sns = new SNSClient({ region: process.env.SNS_REGION ?? 'ap-south-1' });

export async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  // Phone number must be in E.164 format: +91XXXXXXXXXX
  const normalized = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
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
