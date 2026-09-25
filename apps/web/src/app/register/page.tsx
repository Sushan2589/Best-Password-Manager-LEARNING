"use client";

import React from "react";

export default function RegisterForm() {
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);

    const data = {
      username: formData.get("username")?.toString() ?? "",
      email: formData.get("email")?.toString() ?? "",
      password: formData.get("password")?.toString() ?? "",
    };

    try {
      // 2. Send data to the backend via POST
      const response = await fetch("http://localhost:3001/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const result = await response.json();
      console.log("Success:", result);
    } catch (error) {
      console.error("Error submitting form:", error);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input type="text" name="username" placeholder="Username" />
        <input type="email" name="email" placeholder="Email" />
        <input type="password" name="password" placeholder="Password" />

        <button type="submit">Register</button>
      </form>
    </div>
  );
}
