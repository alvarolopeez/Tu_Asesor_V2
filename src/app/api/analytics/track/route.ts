import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createHash } from 'crypto';

/**
 * API Route for Tracking Web Visitor Sessions.
 * 
 * Extracts client IP and creates an anonymous SHA-256 hash.
 * Classifies traffic source via UTM parameters (utm_source, etc.) or referrer.
 * Stores visit details securely in Supabase.
 * 
 * @agent Web / CRM
 * @created 2026-05-20
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, page_path, referrer, user_agent, full_url } = body;

    if (!session_id || !page_path) {
      return NextResponse.json({ error: 'Missing required parameters: session_id or page_path' }, { status: 400 });
    }

    // 1. Resolve client IP and generate an anonymous SHA-256 hash (GDPR compliant)
    let ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             '127.0.0.1';
             
    // If there are multiple proxies, take the first client IP
    if (ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    
    const ipHash = createHash('sha256').update(ip).digest('hex');

    // 2. Classify traffic source based on UTM parameters, generic tags, and referrers
    let source = 'direct';

    if (full_url) {
      try {
        const urlObj = new URL(full_url);
        const utmSource = urlObj.searchParams.get('utm_source');
        const qSource = urlObj.searchParams.get('source');
        const gclid = urlObj.searchParams.get('gclid');
        const fbclid = urlObj.searchParams.get('fbclid');
        const utmMedium = urlObj.searchParams.get('utm_medium');

        if (utmSource) {
          source = utmSource.toLowerCase();
        } else if (qSource) {
          source = qSource.toLowerCase();
        } else if (gclid) {
          source = 'google';
        } else if (fbclid) {
          source = 'facebook';
        } else if (utmMedium) {
          const med = utmMedium.toLowerCase();
          if (['cpc', 'ppc', 'ad'].includes(med)) {
            source = 'paid_search';
          } else {
            source = med;
          }
        }
      } catch (e) {
        console.error('[Analytics Route] Error parsing full_url:', e);
      }
    }

    // If source is still direct, analyze referrer domain
    if (source === 'direct' && referrer) {
      try {
        const refUrl = new URL(referrer);
        const host = refUrl.hostname.toLowerCase();

        if (host.includes('google.')) {
          source = 'google';
        } else if (host.includes('facebook.') || host.includes('fb.')) {
          source = 'facebook';
        } else if (host.includes('instagram.')) {
          source = 'instagram';
        } else if (host.includes('t.co') || host.includes('twitter.') || host.includes('x.com')) {
          source = 'twitter';
        } else if (host.includes('linkedin.')) {
          source = 'linkedin';
        } else if (host.includes('whatsapp.')) {
          source = 'whatsapp';
        } else {
          // Use cleaned domain name as source
          source = host.replace('www.', '');
        }
      } catch (e) {
        // Fallback checks if referrer is a string but not a fully qualified URL
        const refStr = String(referrer).toLowerCase();
        if (refStr.includes('whatsapp')) {
          source = 'whatsapp';
        } else if (refStr.includes('google')) {
          source = 'google';
        } else if (refStr.includes('facebook')) {
          source = 'facebook';
        }
      }
    }

    // 3. Insert record into Supabase web_visits table
    const { error } = await supabase.from('web_visits').insert({
      session_id,
      page_path,
      referrer: referrer || null,
      user_agent: user_agent || null,
      ip_hash: ipHash,
      source: source || 'direct'
    });

    if (error) {
      console.error('[Analytics Route] Supabase Insert Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      ip_hash: ipHash, 
      source: source 
    });
  } catch (error) {
    console.error('[Analytics Route] Server Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
