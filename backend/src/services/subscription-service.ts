  /**
   * Delete subscription with blockchain sync
   * Soft delete: sets status to 'deleted' and removes reminders
   */
  async deleteSubscription(
    userId: string,
    subscriptionId: string,
  ): Promise<SubscriptionSyncResult> {
    return await DatabaseTransaction.execute(async (client) => {
      try {
        // 1. Verify ownership and get subscription details
        const { data: existing, error: fetchError } = await client
          .from("subscriptions")
          .select("*")
          .eq("id", subscriptionId)
          .eq("user_id", userId)
          .single();

        if (fetchError || !existing) {
          throw new Error("Subscription not found or access denied");
        }

        // If already deleted, return early
        if (existing.status === "deleted") {
          return {
            subscription: existing as Subscription,
            syncStatus: "synced",
          };
        }

        // 2. Soft delete - update status to deleted
        const { data: subscription, error: updateError } = await client
          .from("subscriptions")
          .update({
            status: "deleted",
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscriptionId)
          .eq("user_id", userId)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Delete failed: ${updateError.message}`);
        }

        // 3. Cancel all pending reminders for this subscription
        const { error: reminderError } = await client
          .from("reminder_schedules")
          .delete()
          .eq("subscription_id", subscriptionId);

        if (reminderError) {
          logger.warn("Failed to delete reminders during subscription deletion", {
            subscriptionId,
            error: reminderError.message,
          });
          // Don't throw - reminders cleanup failure shouldn't block deletion
        }

        // 4. Sync to blockchain (non-fatal if it fails)
        let blockchainResult;
        let syncStatus: "synced" | "partial" | "failed" = "synced";

        try {
          blockchainResult = await blockchainService.syncSubscription(
            userId,
            subscriptionId,
            "delete",
            subscription,
          );

          if (!blockchainResult.success) {
            syncStatus = "partial";
            logger.warn("Blockchain sync failed for subscription deletion", {
              subscriptionId,
              error: blockchainResult.error,
            });
          }
        } catch (blockchainError) {
          syncStatus = "partial";
          logger.error("Blockchain sync error during deletion (non-fatal):", blockchainError);
          blockchainResult = {
            success: false,
            error:
              blockchainError instanceof Error
                ? blockchainError.message
                : String(blockchainError),
          };
        }

        // 5. Log audit event
        logger.info("Subscription deleted", {
          subscriptionId,
          userId,
          syncStatus,
        });

        return {
          subscription,
          blockchainResult,
          syncStatus,
        };
      } catch (error) {
        logger.error("Subscription deletion failed:", error);
        throw error;
      }
    });
  }