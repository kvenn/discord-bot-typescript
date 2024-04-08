import { AttachmentBuilder, Message } from 'discord.js';
import * as stream from 'node:stream';
import youtubedl from 'youtube-dl-exec';

import { Trigger } from './trigger.js';
import { EventData } from '../models/internal-models.js';

export class TwitchClipTrigger implements Trigger {
    requireGuild = false;
    urlRegex = /https:\/\/clips\.twitch\.tv\/(.+)/;

    // Check if the message contains a Twitch clip URL
    triggered(msg: Message): boolean {
        return this.urlRegex.test(msg.content);
    }

    // Execute the trigger action if a Twitch clip URL is detected
    async execute(msg: Message, _: EventData): Promise<void> {
        const matches = msg.content.match(this.urlRegex);

        if (matches) {
            const url = matches[0]; // Extract the URL

            // Set up a stream.PassThrough to stream the download directly
            const videoStream = new stream.PassThrough();

            // Execute youtube-dl and pipe the output to videoStream
            const subprocess = youtubedl.exec(
                url,
                {
                    format: 'best',
                    output: '-', // Direct output to stdout
                },
                { stdio: ['ignore', 'pipe', 'ignore'] }
            );

            subprocess.stdout.pipe(videoStream);

            // Handle the end of the subprocess
            subprocess.on('close', code => {
                console.log(`youtube-dl process exited with code ${code}`);
            });

            // Send the video stream directly as an attachment in Discord using AttachmentBuilder
            const attachment = new AttachmentBuilder(videoStream, { name: 'clip.mp4' });
            msg.channel
                .send({
                    content: `Here's your Twitch clip!`,
                    files: [attachment],
                })
                .then(() => {
                    console.log('Video sent to Discord');
                })
                .catch(console.error);
        }
    }
}
