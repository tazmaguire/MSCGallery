import { siteConfig } from "@/lib/siteConfig";
import LoginForm from "@/components/LoginForm";
export default function Login() {
  return <LoginForm siteName={siteConfig().name} />;
}
