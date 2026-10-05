import { FC } from 'react';
import { NavLink } from 'react-router-dom';

export const NotFound: FC = () => {
  return (
    <div className="not-found">
      <h1>404 - Page Not Found</h1>
      <p>Looks like this little birdie went snooping for some secrets ;)</p>
      <p>Unfortunately (for you) the page you were looking for does not exist</p>
      <NavLink className="home-button" to="/">
        Return to Home Page
      </NavLink>
    </div>
  );
};
