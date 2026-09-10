import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, PageHeader } from '@/components/ui';
import { StudioAvailability } from '@/components/site/StudioAvailability';
import { can } from '@/lib/permissions';

/**
 * Studio booking inside the CMS.
 *
 * The public /studio page and this one render the SAME <StudioAvailability />,
 * so there is one calendar and one booking path -- a staff copy that could
 * drift from the public one is exactly the bug worth avoiding. The only
 * difference is the chrome around it: this sits inside AppLayout, so a signed-in
 * user keeps the CMS navigation instead of being dropped onto the public site.
 */
export function StudioPage() {
  const profile = useCurrentUser();

  return (
    <>
      <PageHeader
        title="Studio"
        description="Book a 30-minute recording slot. Monday to Friday, 9:00 AM to 6:00 PM."
        actions={
          <Link to="/bookings" className="btn btn-outline small">
            My bookings
          </Link>
        }
      />

      {!can.bookStudio(profile.role) && (
        <Banner kind="info">
          Your role can see studio availability but not book it. Ask an administrator if you
          need booking access.
        </Banner>
      )}

      <StudioAvailability showHeading={false} />
    </>
  );
}
