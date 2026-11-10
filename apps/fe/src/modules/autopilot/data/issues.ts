import type { AutopilotIssue } from "@/modules/autopilot/api"

/** What the engine said can't run unattended (P1.4), in the owner's words. */
export function issueText(issue: AutopilotIssue, name: string): string {
  switch (issue.code) {
    case "uses_secrets":
      return "This job sends a key to a website. Jobs that run alone can't use keys yet, so it can't be turned on."
    case "missing_tools":
      return `${name} no longer has a skill this job uses. Add it back in Skills, then turn the job on.`
    case "no_schedule":
      return "This job has no schedule, so it can only run by hand."
    case "invalid_schedule":
      return "This job's schedule isn't valid."
    case "invalid_input":
      return "This job needs inputs it doesn't have."
    default:
      return issue.message
  }
}
