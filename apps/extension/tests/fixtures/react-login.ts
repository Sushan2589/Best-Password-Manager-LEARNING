import React, { useState } from "react";
import { createRoot } from "react-dom/client";

// A real controlled React form, like Vidya Nepal's id-only login inputs.
function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return React.createElement("form", { onSubmit: (event: React.FormEvent) => { event.preventDefault(); document.body.dataset.submitted = "true"; } },
    React.createElement("label", { htmlFor: "username" }, "Username"),
    React.createElement("input", { id: "username", autoComplete: "username", value: username, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setUsername(event.target.value) }),
    React.createElement("label", { htmlFor: "password" }, "Password"),
    React.createElement("input", { id: "password", type: "password", autoComplete: "current-password", value: password, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value) }),
    React.createElement("button", null, "Sign in"),
    React.createElement("output", { id: "state-check" }, `${username.length}:${password.length}`));
}
createRoot(document.getElementById("login-root")!).render(React.createElement(Login));
