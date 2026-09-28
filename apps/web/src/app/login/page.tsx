"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function RegisterForm() {
    const router = useRouter();
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    

    const formData = new FormData(e.currentTarget);

    const data = {
      email: formData.get("email")?.toString() ?? "",
      password: formData.get("password")?.toString() ?? "",
    };

    try {
      // 2. Send data to the backend via POST
      const response = await fetch("http://localhost:3001/auth/login", {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const result = await response.json();
      console.log("Success:", result);
      router.push("/vault");
    } catch (error) {
      console.error("Error submitting form:", error);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input type="email" name="email" placeholder="Email" />
        <input type="password" name="password" placeholder="Password" />

        <button type="submit">Login</button>
      </form>
    </div>
  );
}
