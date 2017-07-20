// import React from 'react'; import ReactDOM from 'react-dom'; import App from
// './App';
import registerServiceWorker from './registerServiceWorker';
// import './index.css'; ReactDOM.render(<App />,
// document.getElementById('root')); registerServiceWorker();

import React from 'react';
import ReactDOM from 'react-dom';
import {Provider} from 'react-redux';
import 'react-mdl/extra/material.css';
import 'react-mdl/extra/material.js';
import TodoApp from './App';

import store from './Store.js';
import {fetchTodos} from './todos/actions'

store.dispatch(fetchTodos());

ReactDOM.render(
  <Provider store={store}>
  <TodoApp/>
</Provider>, document.getElementById('root'));
registerServiceWorker();
