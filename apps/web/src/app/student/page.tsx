"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Root /student route — redirect to the progress stub.
export default function StudentHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/student/progress");
  }, [router]);
  return null;
}
