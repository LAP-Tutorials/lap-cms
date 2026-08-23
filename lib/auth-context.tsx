"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { onAuthStateChanged, type User } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"

export type AuthorRole = "super" | "admin" | "author" | "moderator" | null

interface AuthState {
  user: User | null
  userRole: AuthorRole
  isLoading: boolean
}

interface AuthContextType extends AuthState {
  isAllowed: (requiredRoles?: AuthorRole[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    userRole: null,
    isLoading: true,
  })

  useEffect(() => {
    // Check for stored auth data in localStorage first for immediate UI update
    const storedAuth = localStorage.getItem("auth_data")
    if (storedAuth) {
      try {
        const { userRole, lastAuthenticated } = JSON.parse(storedAuth)
        // Only use stored data if it's less than 1 hour old
        // SECURITY NOTE: This is for UI responsiveness only. Backend rules must always verify auth token/claims.
        // A knowledgeable user can modify localStorage to spoof 'admin' role in the Client UI, but 
        // they will fail at the database level if rules are correct.
        if (lastAuthenticated && Date.now() - lastAuthenticated < 60 * 60 * 1000) {
          setAuthState((prev) => ({ ...prev, userRole }))
        }
      } catch (e) {
        console.error("Error parsing stored auth data", e)
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const ref = doc(db, "authors", user.uid)
          const snap = await getDoc(ref)

          let role: AuthorRole = null
          if (snap.exists()) {
            role = snap.data().role as AuthorRole

            // Store auth data in localStorage with timestamp
            localStorage.setItem(
              "auth_data",
              JSON.stringify({
                userRole: role,
                lastAuthenticated: Date.now(),
              }),
            )
          }

          setAuthState({
            user,
            userRole: role,
            isLoading: false,
          })
        } catch (error) {
          console.error("Error fetching user role:", error)
          setAuthState({
            user,
            userRole: null,
            isLoading: false,
          })
        }
      } else {
        localStorage.removeItem("auth_data")
        setAuthState({
          user: null,
          userRole: null,
          isLoading: false,
        })
      }
    })

    return () => unsubscribe()
  }, [])

  const isAllowed = (requiredRoles?: AuthorRole[]) => {
    if (!requiredRoles || requiredRoles.length === 0) return true
    if (!authState.userRole) return false

    if (authState.userRole === "super") return true
    return requiredRoles.includes(authState.userRole)
  }

  return <AuthContext.Provider value={{ ...authState, isAllowed }}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
