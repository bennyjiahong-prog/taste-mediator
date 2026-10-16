import { Suspense } from "react";
import { connection } from "next/server";
import { KeyStatus } from "@/components/key-status";
import { MovieNight } from "@/components/movie-night";

export default function Page() {
  return (
    <MovieNight>
      <Suspense fallback={<KeyStatus state="unknown" />}>
        <LiveKeyStatus />
      </Suspense>
    </MovieNight>
  );
}

async function LiveKeyStatus() {
  await connection();
  const configured = Boolean(process.env.QLOO_API_KEY?.trim());
  return <KeyStatus state={configured ? "present" : "missing"} />;
}
