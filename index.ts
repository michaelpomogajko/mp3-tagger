import NodeID3 from 'node-id3';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { readdir } from "node:fs/promises";

// Load service account credentials
const serviceAccountPath = './service-account.json';
const auth = new GoogleAuth({
  keyFile: serviceAccountPath,
  scopes: ['https://www.googleapis.com/auth/cse'],
});


const folderPath = Bun.argv[2];
if(!folderPath) {
  console.error('No folder path provided');
  process.exit(1);
}

async function processMP3Files(folderPath: string): Promise<void> {
  const files = await readdir(folderPath);
  const mp3FileNames = files.filter((file) => file.endsWith('.mp3'));

  for (const fileName of mp3FileNames) {
    const file = Bun.file(fileName);
    if(!file.name) {
      console.log(`Skipping ${fileName} - doesn't match expected format`);
      continue;
    }

    try {
      // Parse filename
      const match = file.name.match(/^([^-]+) - ([^-]+)\.mp3$/);
      if (!match) {
        console.log(`Skipping ${file.name} - doesn't match expected format`);
        continue;
      }

      const [, artist, title] = match;
      const filePath = `${folderPath}/${file.name}`;

      // Search and download cover art
      const coverArtUrl = await getCoverArtUrl(`${artist} - ${title} album cover`);

      if(!coverArtUrl) {
        console.log(`Skipping ${file.name} - no cover art found`);
        continue;
      }

      const imageBuffer = await downloadImage(coverArtUrl);

      const artistName = artist.trim();
      const titleName = title.trim();
      const albumName = titleName.split('(')[0].trim();
      // Set ID3 tags
      const tags: NodeID3.Tags = {
        title: titleName,
        artist: artistName,
        album: albumName,
        performerInfo: artistName,
        image: imageBuffer ? {
          mime: 'image/jpeg',
          type: {
            id: 3,
            name: 'front cover'
          },
          description: 'Album Art',
          imageBuffer: imageBuffer
        } : undefined
      };

      // Write tags to file using node-id3
      NodeID3.write(tags, filePath);
      console.log(`Processed: ${file.name}`);

    } catch (error) {
      console.error(`Error processing ${file.name}:`, error);
    }
  }
}

async function getCoverArtUrl(query: string): Promise<string | null> {
  try {
    const response = await google.customsearch('v1').cse.list({
      auth: auth,
      cx: Bun.env.SEARCH_ENGINE_ID,
      q: query,
      searchType: 'image',
      num: 1
    });

    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0].link ?? null;
    }
    return null;
  } catch (error) {
    console.error('Error fetching cover art:', error);
    return null;
  }
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch image');
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error downloading image:', error);
    return null;
  }
}

await processMP3Files(folderPath)