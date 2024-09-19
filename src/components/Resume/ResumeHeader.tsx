import { FC } from 'react';

export const ResumeHeader: FC = () => (
  <div className="resume-header">
    <img className="resume-avatar" src="./img/shumunov_avatar.jpg" alt="Shugmi Shumunov Avatar" />
    <h2>Shugmi Shumunov</h2>
    <h3>Full Stack Software Engineer</h3>
    <hr />
    <p className="programming-quote">
      {/* TODO: Add more taglines / quotes related to programming */}
      {/* TODO: Typewriter / update to randomize or use different animations as a prop */}
      <span className="italic-text">Programming is all about laziness</span>
      &nbsp;-&nbsp;
      <a href="https://maxogden.com/" rel="noopener noreferrer" target="_blank">
        Maxwell Ogden
      </a>
    </p>
    <hr />
    <h4>Email</h4>
    <p>SShumunov @ Google&apos;s email</p>
    <hr />
  </div>
);
