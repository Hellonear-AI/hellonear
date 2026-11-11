"use client"

import { createContext, useContext } from "react"
import type { NodeRun } from "@/modules/builder/data/testRun"

/** Test run state per canvas node id, read by every block card (B1.2). */
export const TestRunContext = createContext<Record<string, NodeRun>>({})

/** Every block's Test run state, Ifs included. */
export const useTestRunNodes = () => useContext(TestRunContext)

/** One block's Test run state, if it ran. */
export const useNodeRun = (nodeId?: string): NodeRun | undefined => useContext(TestRunContext)[nodeId ?? ""]
