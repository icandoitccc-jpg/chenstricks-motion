import React from 'react';
import { Projects } from './Projects';
export const Home: React.FC<{go:(p:string)=>void}> = ({go}) => <Projects recent go={go}/>;
