import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Invokes the 'game-action' Deno Edge Function with the provided request body.
 */
export async function invokeGameAction(body: any) {
    const { data, error } = await supabase.functions.invoke('game-action', {
        body,
    });
    
    if (error) {
        console.error('Edge Function Error:', error);
        throw new Error(error.message || 'Error invoking game action');
    }
    
    if (data && data.error) {
        console.error('Edge Function Logic Error:', data.error);
        throw new Error(data.error);
    }
    
    return data;
}

/**
 * A Socket-like adapter that maps the Socket.IO interface to Supabase Realtime Broadcast.
 */
class SupabaseSocketAdapter {
    private channel: RealtimeChannel | null = null;
    private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();
    private isSubscribed = false;
    public playerId: string | null = null;
    // Separate from `channel`: connectToRoom tears that one down on
    // create/join, and the main-screen public list must survive it.
    private lobbyChannel: RealtimeChannel | null = null;

    /**
     * Connect to a specific room channel.
     */
    public connectToRoom(roomCode: string) {
        const formattedCode = roomCode.toUpperCase();
        
        if (this.channel) {
            this.channel.unsubscribe();
            this.isSubscribed = false;
        }

        this.channel = supabase.channel(`room:${formattedCode}`, {
            config: { broadcast: { self: true } }
        });

        // Wildcard listener to route all broadcasts
        this.channel.on('broadcast', { event: '*' }, ({ event: eventName, payload }) => {
            if (eventName.startsWith('s2c:game_state:')) {
                const targetPlayerId = eventName.replace('s2c:game_state:', '');
                if (targetPlayerId === this.playerId) {
                    const callbacks = this.listeners.get('s2c:game_state') || [];
                    callbacks.forEach(cb => cb(payload));
                }
                return;
            }

            const callbacks = this.listeners.get(eventName) || [];
            callbacks.forEach(cb => cb(payload));
        });

        this.channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                this.isSubscribed = true;
                const callbacks = this.listeners.get('connect') || [];
                callbacks.forEach(cb => cb());
            }
        });
    }

    /**
     * Subscribe to the global public-games feed (main screen).
     * Idempotent — safe under React StrictMode double-mount.
     */
    public subscribeToPublicLobby(onUpdate: (payload: { rooms: any[] }) => void) {
        if (this.lobbyChannel) return;
        this.lobbyChannel = supabase.channel('lobby:public');
        this.lobbyChannel.on('broadcast', { event: 's2c:public_rooms_update' }, ({ payload }) => {
            onUpdate(payload);
        });
        this.lobbyChannel.subscribe();
    }

    public unsubscribeFromPublicLobby() {
        this.lobbyChannel?.unsubscribe();
        this.lobbyChannel = null;
    }

    /**
     * Subscribe to an event (Socket.IO syntax).
     */
    public on(event: string, callback: (...args: any[]) => void) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);

        // Immediate fire if registering for 'connect' and we are already connected
        if (event === 'connect' && this.isSubscribed) {
            callback();
        }
    }

    /**
     * Unsubscribe from an event (Socket.IO syntax).
     */
    public off(event: string, callback: (...args: any[]) => void) {
        const callbacks = this.listeners.get(event) || [];
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
            callbacks.splice(index, 1);
        }
    }

    /**
     * Emit an action to the server (Socket.IO syntax mapped to Supabase Edge Function).
     */
    public async emit(event: string, data: any, callback?: (response: any) => void) {
        const action = event.replace('c2s:', '');
        
        try {
            let payload: any = { action };
            if (typeof data === 'string') {
                payload.roomCode = data;
            } else if (data && typeof data === 'object') {
                payload = { ...payload, ...data };
            }
            
            const res = await invokeGameAction(payload);
            if (callback) callback(res);
        } catch (err: any) {
            console.error(`Error emitting ${event}:`, err);
            if (callback) {
                callback({ error: err.message || 'Unknown error occurred' });
            }
        }
    }
}

export const socket = new SupabaseSocketAdapter();
export type Socket = SupabaseSocketAdapter;
