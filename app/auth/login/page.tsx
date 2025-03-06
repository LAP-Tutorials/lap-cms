"use client";

import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import PageTitle from "@/components/PageTitle";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/admin");
    } catch (err: any) {
      let friendlyMessage = "";
      switch (err.code) {
        case "auth/invalid-email":
          friendlyMessage = "The email address is invalid.";
          break;
        case "auth/user-not-found":
          friendlyMessage = "No account found with this email address.";
          break;
        case "auth/wrong-password":
          friendlyMessage = "Incorrect password. Please try again.";
          break;
        case "auth/too-many-requests":
          friendlyMessage = "Too many failed attempts. Please try again later.";
          break;
        default:
          friendlyMessage = "An error occurred. Please try again.";
      }
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen text-white">
      <form
        onSubmit={handleLogin}
        className="p-9 border border-white w-[90%] md:w-[60%] lg:w-[35%]"
      >
        <div className="mb-5">
          <PageTitle
            className="sr-only"
            imgSrc="/images/titles/lap-cms.svg"
            imgAlt="Dashboard"
          >
            L.A.P CMS
          </PageTitle>
        </div>
        {/* <h1 className="text-subtitle text-xl mb-10 text-center">L.A.P CMS</h1> */}

        {error && <p className="text-red-400 mb-2">{error}</p>}

        <input
          type="email"
          className="block w-full mb-7 p-3 text-white border border-white outline-none"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div className="relative mb-10">
          <input
            type={showPassword ? "text" : "password"}
            className="block w-full p-3 text-white border border-white outline-none"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div
            className="absolute inset-y-0 right-0 flex items-center px-3 cursor-pointer border border-white"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="text-center w-full py-3 font-medium hover:bg-[#8a2be2] transition ease-in-out duration-300"
        >
          {loading ? "Verifying..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
