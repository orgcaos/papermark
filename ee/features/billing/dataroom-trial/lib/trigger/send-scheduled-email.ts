import { task } from "@trigger.dev/sdk";

// Dataroom trial nurture emails are out of scope for this deployment
// (datarooms aren't used), so this code path is never actually exercised.
// These tasks are defined (not just typed) so the trigger.dev usage at the
// call site still type-checks correctly.

export const sendDataroomTrialInfoEmailTask = task({
  id: "send-dataroom-trial-info-email",
  run: async (_payload: {
    to: string;
    useCase?: string;
    name: string;
  }): Promise<void> => {
    return;
  },
});

export const sendDataroomTrial24hReminderEmailTask = task({
  id: "send-dataroom-trial-24h-reminder-email",
  run: async (_payload: {
    to: string;
    name: string;
    teamId: string;
  }): Promise<void> => {
    return;
  },
});

export const sendDataroomTrialExpiredEmailTask = task({
  id: "send-dataroom-trial-expired-email",
  run: async (_payload: {
    to: string;
    name: string;
    teamId: string;
  }): Promise<void> => {
    return;
  },
});
