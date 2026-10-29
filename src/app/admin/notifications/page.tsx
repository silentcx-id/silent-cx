import { notificationMetadata, notificationPage } from "@/lib/notification-page";

export const metadata = notificationMetadata;

export default async function NotificationsPage() {
  return notificationPage("admin");
}
