// Test fixture: a login screen, to check that capture says "your login expired"
// instead of "couldn't find the button" (used by scripts/test-recorder.mjs).
export default function LoginDemo() {
  return (
    <form style={{ fontFamily: "system-ui, sans-serif", padding: 32 }} onSubmit={(e) => e.preventDefault()}>
      <h1>Sign in</h1>
      <label htmlFor="u">Email</label> <input id="u" />
      <br />
      <label htmlFor="p">Password</label> <input id="p" type="password" />
      <br />
      <button>Sign in</button>
    </form>
  );
}
