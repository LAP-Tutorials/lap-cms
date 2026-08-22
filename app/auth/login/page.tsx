"use client";

import { type FormEvent, useState } from "react";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  deleteUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;

      // Check if user exists in 'authors' collection
      const userDocRef = doc(db, "authors", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // User is not authorized, delete from Auth if they manage to log in without a profile
        await deleteUser(user);
        await signOut(auth);
        setError("You do not have access to this site.");
        return;
      }

      router.push("/admin");
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user exists in 'authors' collection
      const userDocRef = doc(db, "authors", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // User is not authorized, prevent account creation by deleting the auth profile
        await deleteUser(user);
        await signOut(auth);
        setError("You do not have access to this site.");
        return;
      }

      router.push("/admin");
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAuthError = (err: any) => {
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
      case "auth/popup-closed-by-user":
        friendlyMessage = "Sign-in popup was closed. Please try again.";
        break;
      default:
        friendlyMessage = "An error occurred. Please try again.";
    }
    setError(friendlyMessage);
    console.error("Authentication error:", err);
  };

  return (
    <div className="flex items-center justify-center min-h-screen text-white">
      <div className="p-9 border border-white w-[90%] md:w-[60%] lg:w-[35%]">
        <div className="mb-5">
          <PageTitle
            className="sr-only"
            imgSrc="/images/titles/lap-cms.svg"
            imgAlt="Dashboard"
          >
            L.A.P CMS
          </PageTitle>
        </div>

        {error && <p className="text-red-400 mb-4 text-center">{error}</p>}

        <form onSubmit={handleLogin}>
          <input
            type="email"
            className="block w-full mb-7 p-3 text-white border border-white outline-none"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={googleLoading}
          />

          <div className="relative mb-10">
            <input
              type={showPassword ? "text" : "password"}
              className="block w-full p-3 text-white border border-white outline-none"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={googleLoading}
            />
            <div
              className="absolute inset-y-0 right-0 flex items-center px-3 cursor-pointer border border-white"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
            </div>
          </div>

          <Button
            variant="outline"
            type="submit"
            disabled={loading || googleLoading}
            className="text-center w-full py-3 font-medium hover:bg-[#8a2be2] transition ease-in-out duration-300"
          >
            {loading ? "Verifying..." : "Sign In"}
          </Button>
        </form>

        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-white/30"></div>
          <span className="flex-shrink mx-4 text-white/50">OR</span>
          <div className="flex-grow border-t border-white/30"></div>
        </div>

        <Button
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={loading || googleLoading}
          className="w-full flex items-center justify-center gap-2 py-6"
        >
          {googleLoading ? (
            "Signing in..."
          ) : (
            <>
              <FcGoogle size={22} />
              <span>Sign in with Google</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
