import bcrypt from "bcryptjs";

// pnpm's `run <script> -- <arg>` forwards the literal "--" through to some
// shells/versions instead of stripping it, so skip it if present.
const args = process.argv.slice(2).filter((a) => a !== "--");
const password = args[0];
if (!password) {
  console.error("Usage: pnpm --filter @etsymagazam/api run hash-password -- \"your-password\"");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log(hash);
