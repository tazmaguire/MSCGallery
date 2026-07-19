import { siteConfig } from "@/lib/siteConfig";
import LoginForm from "@/components/LoginForm";
export default function Login() {
  const site = siteConfig();
  return <LoginForm siteName={site.name} logoUrl={site.logoUrl} />;
}
