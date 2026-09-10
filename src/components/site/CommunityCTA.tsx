import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function CommunityCTA() {
  return (
    // The About anchor moved to <AboutStation>, which says what the station is
    // before this asks the reader to join it. Two id="about" would be invalid.
    <section className="cta" id="join">
      <div className="cta-inner">
        <div className="cta-copy">
          <p className="eyebrow eyebrow-invert">Be a part of 90.8</p>
          <h2 className="cta-title">
            Share your voice
            <br />
            with your community.
          </h2>
          <p className="cta-text">
            Want to host a show, put a song on the request hour, or bring an idea to life on
            air? The studio is student-run and open to the community, and we are always
            looking for new voices.
          </p>
          <div className="cta-actions">
            <Link to="/register" className="btn btn-solid btn-lg">
              Request access
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link to="/login" className="btn btn-quiet btn-lg">
              Already on the team?
            </Link>
          </div>
        </div>

        <div className="cta-side" aria-hidden="true">
          <div className="cta-badge">
            <span className="cta-badge-top">STUDENT RUN</span>
            <span className="cta-badge-freq">90.8</span>
            <span className="cta-badge-unit">MHz</span>
            <span className="cta-badge-bottom">VIT VELLORE</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer" id="contact">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <Logo size={42} />
          <p className="footer-tagline">More than radio. A louder community.</p>
        </div>

        <nav className="footer-links" aria-label="Footer">
          <div>
            <h3>Listen</h3>
            <a href="#schedule">Today&rsquo;s schedule</a>
            <a href="#episodes">Recent episodes</a>
          </div>
          <div>
            <h3>Station</h3>
            <a href="#about">About us</a>
            <Link to="/register">Join the team</Link>
            <Link to="/login">Team sign in</Link>
          </div>
          <div>
            <h3>Find us</h3>
            <p>VIT Vellore</p>
            <p>Tiruvalam Road, Katpadi</p>
            <p>Vellore, Tamil Nadu 632014</p>
          </div>
        </nav>
      </div>

      <div className="site-footer-base">
        <span>&copy; {new Date().getFullYear()} VIT Community Radio &middot; 90.8 MHz</span>
        <span className="footer-made">MADE BY STUDENTS, FOR THE COMMUNITY</span>
      </div>
    </footer>
  );
}
