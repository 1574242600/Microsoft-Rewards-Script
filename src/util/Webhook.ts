import { loadConfig } from './Load'


export async function Webhook(content: string) {
    const webhook = loadConfig().webhook

    if (!webhook.enabled || webhook.url.length < 10) return
    
    const request = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        data: {
            'content': content
        }
    }

    await fetch(webhook.url, request).catch(() => { })
}