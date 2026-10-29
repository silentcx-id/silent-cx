import { accountMetadata, accountPage } from "@/lib/account-page";

export const metadata = accountMetadata;

export default async function AccountPage() {
  return accountPage("client");
}
