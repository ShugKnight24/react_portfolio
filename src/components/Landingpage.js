import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';
import HTMLIcon from '../static/img/tech_icons/html.svg';
import CSSIcon from '../static/img/tech_icons/css.svg';
import SASSIcon from '../static/img/tech_icons/sass.svg';
import BootstrapIcon from '../static/img/tech_icons/bootstrap.svg';
import JavaScriptIcon from '../static/img/tech_icons/javascript.svg';
import TypeScriptIcon from '../static/img/tech_icons/typescript.svg';
import JqueryIcon from '../static/img/tech_icons/jquery.svg';
import ReactIcon from '../static/img/tech_icons/react.svg';
import NodeJSIcon from '../static/img/tech_icons/nodejs.svg';
import PHPIcon from '../static/img/tech_icons/php.svg';
import MySQLIcon from '../static/img/tech_icons/mysql.svg';
import ShopifyIcon from '../static/img/tech_icons/shopify.svg';
import ShopifyLiquidIcon from '../static/img/tech_icons/shopify_liquid.svg';
import RustIcon from '../static/img/tech_icons/rust.svg';
import PythonIcon from '../static/img/tech_icons/python.svg';

export default class Landing extends Component {
	render() {
		return(
			<div className="landing-container">
				<Grid className="landing-grid">
					<Cell col={ 12 }>
						<div className="home-feature">
							<div className="feature-text">
								<h1>Shugmi Shumunov</h1>
								<div>
									<span className="bar">|</span>
									<p>
										Consultant
									</p>
									<span className="bar">|</span>
									<p>
										Developer
									</p>
									<span className="bar">|</span>
									<p>
										Learner
									</p>
									<span className="bar">|</span>
								</div>
							</div>
							<img
								src="./img/shug_lake.jpeg"
								alt="Shugmi Shumunov Relaxing by the water"
								className="splash-img"
							/>
						</div>
						<div className="banner-text">
							<h2>Full Stack Web Developer</h2>
							<hr />
							<div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ HTMLIcon } alt="HTML5 Icon" />
									<p>HTML</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ CSSIcon } alt="CSS3 Icon" />
									<p>CSS</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ SASSIcon } alt="SASS Icon" />
									<p>SASS</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ BootstrapIcon } alt="Bootstrap Icon" />
									<p>BootStrap</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ JavaScriptIcon } alt="JavaScript Icon" />
									<p>JavaScript</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ TypeScriptIcon } alt="TypeScript Icon" />
									<p>TypeScript</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img className="jquery" src={ JqueryIcon } alt="jQuery Icon" />
									<p>jQuery</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img className="react" src={ ReactIcon } alt="React Icon" />
									<p>React</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img className="react" src={ ReactIcon } alt="React Native Icon" />
									<p>React Native</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img className="node" src={ NodeJSIcon } alt="NodeJS Icon" />
									<p>Node.js</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ PHPIcon } alt="PHP Icon" />
									<p>PHP</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img className="mysql" src={ MySQLIcon } alt="MySQL Icon" />
									<p>MySQL</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ ShopifyIcon } alt="Shopify Icon" />
									<p>Shopify</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ ShopifyLiquidIcon }alt="Shopify Liquid Icon" />
									<p>Liquid</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ RustIcon } alt="Rust Icon" />
									<p>Rust</p>
								</div>
								<span className="bar">|</span>
								<div className="tech-skill">
									<img src={ PythonIcon } alt="Python Icon" />
									<p>Python</p>
								</div>
								<span className="bar">|</span>
							</div>
							<div className="social-links">
								{ /* GitHub Link */ }
								<a href="https://github.com/ShugKnight24" rel="noopener noreferrer" target="_blank">
									<i className="fa fa-github" aria-hidden="true" />
								</a>
								{ /* LinkedIn Link */ }
								<a href="https://www.linkedin.com/in/shugmishumunov/" rel="noopener noreferrer" target="_blank">
									<i className="fa fa-linkedin-square" aria-hidden="true" />
								</a>
							</div>
						</div>
					</Cell>
				</Grid>
			</div>
		);
	}
}
