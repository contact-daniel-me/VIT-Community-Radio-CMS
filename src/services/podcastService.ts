export interface PodcastEpisode {
  id: string;
  title: string;
  summary: string;
  pubDate: string;
  audioUrl: string;
  duration: string;
  artworkUrl: string;
  spotifyLink: string;
}

const RSS_URL = 'https://anchor.fm/s/dd6c2248/podcast/rss';

export const podcastService = {
  /**
   * Fetches and parses the public RSS feed to extract all podcast episodes.
   * Uses DOMParser so this must run in the browser environment.
   */
  async getEpisodes(): Promise<PodcastEpisode[]> {
    try {
      const response = await fetch(RSS_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
      }
      
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      
      const items = xmlDoc.querySelectorAll('item');
      const episodes: PodcastEpisode[] = [];

      items.forEach((item) => {
        const id = item.querySelector('guid')?.textContent || '';
        const title = item.querySelector('title')?.textContent || 'Untitled Episode';
        
        // Strip HTML from the description/summary
        let summaryHtml = item.querySelector('description')?.textContent || '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = summaryHtml;
        const summary = tmp.textContent || tmp.innerText || '';

        const pubDate = item.querySelector('pubDate')?.textContent || '';
        const audioUrl = item.querySelector('enclosure')?.getAttribute('url') || '';
        // Note: itunes:duration is in the 'itunes' namespace, so we use just 'duration' or getElementsByTagNameNS
        let duration = item.getElementsByTagNameNS('http://www.itunes.com/dtds/podcast-1.0.dtd', 'duration')[0]?.textContent;
        if (!duration) {
          // Fallback just in case
          duration = item.getElementsByTagName('itunes:duration')[0]?.textContent || '--:--';
        }

        let artworkUrl = item.getElementsByTagNameNS('http://www.itunes.com/dtds/podcast-1.0.dtd', 'image')[0]?.getAttribute('href');
        if (!artworkUrl) {
           artworkUrl = item.getElementsByTagName('itunes:image')[0]?.getAttribute('href') || '';
        }

        const spotifyLink = item.querySelector('link')?.textContent || '';

        if (id && audioUrl) {
          episodes.push({
            id,
            title,
            summary: summary.trim(),
            pubDate,
            audioUrl,
            duration,
            artworkUrl,
            spotifyLink,
          });
        }
      });

      return episodes;
    } catch (error) {
      console.error('Error fetching podcast episodes:', error);
      return [];
    }
  }
};
