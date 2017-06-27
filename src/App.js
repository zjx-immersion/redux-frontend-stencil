import React from 'react';
import {BrowserRouter as Router, Route, Link} from 'react-router-dom';
import { Layout, Header, Navigation, Drawer, Content } from 'react-mdl';
import {view as Todos} from './todos/';
import {view as Filter} from './filter/';

const TodoApp = () => (
    <div>
      <Todos />
      <Filter />
    </div>
)

const About = () => (
  <div>
    <h2>About</h2>
  </div>
)

const Topic = ({ match }) => (
  <div>
    <h3>{match.params.topicId}</h3>
  </div>
)

const Topics = ({ match }) => (
  <div>
    <h2>Topics</h2>
    <ul>
      <li>
        <Link to={`${match.url}/rendering`}>
          Rendering with React
        </Link>
      </li>
      <li>
        <Link to={`${match.url}/components`}>
          Components
        </Link>
      </li>
      <li>
        <Link to={`${match.url}/props-v-state`}>
          Props v. State
        </Link>
      </li>
    </ul>

    <Route path={`${match.url}/:topicId`} component={Topic}/>
    <Route exact path={match.url} render={() => (
      <h3>Please select a topic.</h3>
    )}/>
  </div>
)

const BasicExample = () => (
  <Router>
    <div>
      <div>
          <Layout fixedHeader>
              <Header title={<span><span style={{ color: '#ddd' }}>Area / </span><strong>The Title</strong></span>}>
                  <Navigation>
                    <li><Link to="/">Home</Link></li>
                    <li><Link to="/about">About</Link></li>
                    <li><Link to="/topics">Topics</Link></li>
                  </Navigation>
              </Header>
              <Drawer title="Title">
                  <Navigation>
                    <li><Link to="/">Home</Link></li>
                    <li><Link to="/about">About</Link></li>
                    <li><Link to="/topics">Topics</Link></li>
                  </Navigation>
              </Drawer>
              <Content > 
                <div style={{ margin: '20px' }}>
                  <Route exact path="/" component={TodoApp}/>
                  <Route path="/about" component={About}/>
                  <Route path="/topics" component={Topics}/>
                </div>
              </Content>
          </Layout>
      </div>
    </div>
  </Router>
)

export default BasicExample