import { siteConfig } from "@/lib/siteConfig";
import LoginForm from "@/components/LoginForm";
export default async function Login() {
  const site = await siteConfig();
  return <LoginForm siteName={site.name} logoUrl={site.logoUrl} />;
}
