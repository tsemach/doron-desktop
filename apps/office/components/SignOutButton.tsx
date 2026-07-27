"use client";

import { signOut } from "next-auth/react";
import { Button } from "@workspace/ui";

export default function SignOutButton() {
  return (
    <Button variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
      Sign out
    </Button>
  );
}
