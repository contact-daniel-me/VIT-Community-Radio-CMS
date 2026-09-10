import { Link } from 'react-router-dom';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/CommunityCTA';
import { StudioAvailability } from '@/components/site/StudioAvailability';
import { useAuth } from '@/hooks/useAuth';

/**
 * The Studio tab: a page of its own, publicly reachable.
 *
 * This is the ONLY studio calendar in the app. It works signed out (occupancy
 * from the anonymous-safe view), and for a signed-in RJ the same grid opens the
 * booking dialog — so there is one calendar and one booking path, not a public
 * copy and a staff copy that can drift apart.
 */
export function StudioPublicPage() {
  const { session, profile } = useAuth();
  const signedIn = Boolean(session && profile);

  return (
    <div className="site">
      <SiteHeader />

      <main id="main">
        <section className="studio-hero">
          <p className="eyebrow">
            <span>Studio 1</span>
            <span className="eyebrow-rule" />
            <span>VIT Vellore</span>
          </p>
          <h1 className="studio-hero-title">Book the radio studio.</h1>
          <p className="studio-hero-copy">
            Thirty minutes at the desk, Monday to Friday. Pick a free slot, tell us what you
            are making, and the studio is yours.
          </p>

          <div className="studio-hero-facts">
            <div>
              <dt>Open</dt>
              <dd>Mon&ndash;Fri, 9:00 AM&ndash;6:00 PM</dd>
            </div>
            <div>
              <dt>Slot length</dt>
              <dd>30 minutes</dd>
            </div>
            <div>
              <dt>Lunch</dt>
              <dd>1:00&ndash;2:00 PM, closed</dd>
            </div>
            <div>
              <dt>Notice</dt>
              <dd>24 hours ahead</dd>
            </div>
          </div>

          {signedIn ? (
            <p className="studio-hero-note">
              Signed in as {profile?.full_name}. Your own slots appear in red &mdash;{' '}
              <Link to="/bookings">see all your bookings</Link>.
            </p>
          ) : (
            <p className="studio-hero-note">
              Anyone can see what is free. <Link to="/login">Sign in</Link> to reserve a slot,
              or <Link to="/register">request access</Link> if you are new to the station.
            </p>
          )}
        </section>

        <StudioAvailability />

        <section className="section" id="studio-rules">
          <div className="section-head">
            <div>
              <p className="eyebrow">Before you book</p>
              <h2 className="section-title">How the studio works</h2>
            </div>
          </div>

          <ol className="studio-steps">
            <li>
              <span className="studio-step-n">1</span>
              <div>
                <h3>Book at least a day ahead</h3>
                <p>
                  Slots open 24 hours in advance. Need the studio sooner? Contact the station
                  administrator &mdash; only they can place a same-day booking.
                </p>
              </div>
            </li>
            <li>
              <span className="studio-step-n">2</span>
              <div>
                <h3>Bring an approved script</h3>
                <p>
                  Tell us whether your section head has signed off the script. It does not block
                  the booking, but QC will ask.
                </p>
              </div>
            </li>
            <li>
              <span className="studio-step-n">3</span>
              <div>
                <h3>Choose who edits</h3>
                <p>
                  Cut it yourself, or ask for one of the station editors. You can change your
                  mind later &mdash; an administrator can reassign the editor.
                </p>
              </div>
            </li>
            <li>
              <span className="studio-step-n">4</span>
              <div>
                <h3>Record, upload, review</h3>
                <p>
                  After your session the recording goes to editing, then production, then QC.
                  You can follow it the whole way from your bookings.
                </p>
              </div>
            </li>
          </ol>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
