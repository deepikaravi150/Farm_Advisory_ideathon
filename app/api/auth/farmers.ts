import { queryItems, scanItems, Tables } from '@/lib/aws/dynamodb';

type FarmerRecord = Record<string, unknown>;

function isMissingPhoneIndex(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.name === 'ValidationException' && err.message.toLowerCase().includes('index');
}

export async function findFarmersByPhone(phone: string): Promise<FarmerRecord[]> {
  try {
    return await queryItems({
      TableName: Tables.FARMER_PROFILES,
      IndexName: 'phone-index',
      KeyConditionExpression: 'phone = :phone',
      ExpressionAttributeValues: { ':phone': phone },
    });
  } catch (err) {
    if (!isMissingPhoneIndex(err)) throw err;

    const farmers = await scanItems(Tables.FARMER_PROFILES);
    return farmers.filter((farmer) => farmer.phone === phone);
  }
}
