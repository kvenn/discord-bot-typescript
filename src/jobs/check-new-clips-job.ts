import fetch from 'node-fetch';

import { CustomClient } from '../extensions/index.js';
import { Job } from '../jobs/index.js';
import { ClientUtils } from '../utils/index.js';

interface ClipPoster {
    guildId: string;
    textChannelId: string;
    twitchBroadcastId: string;
}

export const kyleGameClipPoster: ClipPoster = {
    guildId: '1177719384668635196',
    textChannelId: '1177719384668635199',
    twitchBroadcastId: '131715921',
};

interface Clip {
    url: string;
    created_at: string;
}

interface ClipData {
    data: Clip[];
}

const inMemoryCache: Map<string, string> = new Map<string, string>();
const minuteInMs = 60000;

export class CheckNewClipsJob extends Job {
    name = 'CheckNewClipsJob';
    log = true;
    // Every 1 minute
    schedule = '0 * * * * *';
    private twitchBaseUrl = 'https://api.twitch.tv/helix/clips';
    private readonly clipPosters: ClipPoster[];
    private readonly client: CustomClient;

    constructor(client: CustomClient, clipPosters: ClipPoster[] = []) {
        super();
        this.client = client;
        this.clipPosters = clipPosters;
    }

    private async fetchClips(
        twitchBroadcastId: string,
        greaterThanIsoString: string
    ): Promise<Clip[]> {
        const url = `${this.twitchBaseUrl}?broadcaster_id=${twitchBroadcastId}&started_at=${greaterThanIsoString}`;
        const response = await fetch(url, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                Authorization: `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = (await response.json()) as ClipData;
        return data.data || [];
    }

    public async run(): Promise<void> {
        for (const clipPoster of this.clipPosters) {
            const mostRecentCreatedIsoString = inMemoryCache.get(clipPoster.twitchBroadcastId);
            const isoStringToUse =
                mostRecentCreatedIsoString ?? new Date(Date.now() - minuteInMs).toISOString();
            const clips = await this.fetchClips(clipPoster.twitchBroadcastId, isoStringToUse);
            if (clips.length === 0) {
                continue;
            }

            inMemoryCache.set(clipPoster.twitchBroadcastId, clips[0].created_at);

            const guild = await ClientUtils.getGuild(this.client, clipPoster.guildId);
            const textChannel = await ClientUtils.findTextChannel(guild, clipPoster.textChannelId);
            if (!textChannel) {
                console.error(
                    `Text channel ${clipPoster.textChannelId} not found in guild ${clipPoster.guildId}.`
                );
                continue;
            }

            for (const clip of clips) {
                const clipCreationTime = new Date(clip.created_at).getTime();
                const mostRecentTime = new Date(isoStringToUse).getTime();
                if (clipCreationTime > mostRecentTime) {
                    textChannel.send(`New clip: <${clip.url}>`);
                }
            }
        }
    }
}
