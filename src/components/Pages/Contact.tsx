import { FC } from 'react';
import { ContactDetails } from '../Contact/ContactDetails';
import { ContactHeader } from '../Contact/ContactHeader';
import { Cell, Grid } from '../Grid';

export const Contact: FC = () => {
  return (
    <div className="contact-body">
      <Grid extraClass="contact-grid">
        <Cell columns={'half'}>
          <ContactHeader />
        </Cell>
        <Cell columns={'half'}>
          <ContactDetails />
        </Cell>
      </Grid>
    </div>
  );
};
