import { signIn } from "@/auth";
export default function Login() {
  return (
    <main className="login">
      <form
        action={async (form: FormData) => {
          "use server";
          await signIn("credentials", {
            email: form.get("email"),
            password: form.get("password"),
            redirectTo: "/",
          });
        }}
      >
        <span className="brandmark">a</span>
        <h1>Welcome to Autopilot</h1>
        <p>Sign in to your workspace.</p>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" required />
        </label>
        <button className="button primary">Sign in</button>
      </form>
    </main>
  );
}
