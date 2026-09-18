/** React binding only; the client owns transport and canonical transcript projection. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as api from '@/lib/hosted-api';
import { readSse } from '@/lib/sse';
import { HostedConversationClient } from './conversation-client';

export function useHostedWindie(
  accessToken: string | null,
  requestedConversationId: string | null,
  onConversationCreated: (conversationId: string) => void,
) {
  const [client] = useState(
    () => new HostedConversationClient({ ...api, readSse }),
  );
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => {
    client.setCredentials(accessToken);
  }, [client, accessToken]);
  useEffect(() => {
    client.setRouteListener(onConversationCreated);
  }, [client, onConversationCreated]);
  useEffect(() => {
    client.start();
    return () => client.dispose();
  }, [client]);
  useEffect(() => {
    void client.navigate(requestedConversationId);
  }, [client, requestedConversationId]);
  return {
    state,
    sendMessage: client.sendMessage,
    stop: client.stop,
    selectHead: client.selectHead,
    startNewChat: () => client.navigate(null, undefined, true),
  };
}
