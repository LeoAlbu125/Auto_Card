import type { WorkItem } from "./types";

export const DEMO_TRANSCRIPT = `We need to add validation to the payment API,
handle null cases, and clarify the response format.
For user auth, we should document OAuth edge cases from today's discussion.
Also spin up a new card for exporting invoices to CSV — finance asked for it this week.`;

export const INITIAL_WORK_ITEMS: WorkItem[] = [
  {
    id: "wi-1",
    title: "Payment API",
    description: "Current implementation for handling payments",
    acceptanceCriteria: ["Basic payment flow works"],
    column: "todo",
  },
  {
    id: "wi-2",
    title: "User Auth",
    description: "OAuth and session handling",
    acceptanceCriteria: ["Login and logout flows"],
    column: "inprogress",
  },
  {
    id: "wi-3",
    title: "Deploy Fix",
    description: "Pipeline reliability",
    acceptanceCriteria: ["Green deploy on main"],
    column: "done",
  },
];
