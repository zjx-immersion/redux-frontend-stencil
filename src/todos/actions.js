import {
  ADD_TODO,
  TOGGLE_TODO,
  REMOVE_TODO,
  FETCH_STARTED,
  FETCH_SUCCESS,
  FETCH_FAILURE
} from './actionTypes.js';

let nextTodoId = 0;

export const addTodo = (text) => ({
  type: ADD_TODO,
  completed: false,
  id: nextTodoId++,
  text: text
});

export const toggleTodo = (id) => ({type: TOGGLE_TODO, id: id});

export const removeTodo = (id) => ({type: REMOVE_TODO, id: id});

export const fetchTodosStarted = () => ({type: FETCH_STARTED});

export const fetchTodosSuccess = (result) => ({type: FETCH_SUCCESS, todos: result})

export const fetchTodosFailure = (error) => ({type: FETCH_FAILURE, error})

export const fetchTodos = (filter) => {
  return (dispatch) => {
    const apiUrl = `https://private-abad1c-apitest153.apiary-mock.com/`;

    dispatch(fetchTodosStarted())

    return fetch(apiUrl).then((response) => {
      if (response.status !== 200) {
        throw new Error('Fail to get response with status ' + response.status);
      }

      response
        .json()
        .then((responseJson) => {
          dispatch(fetchTodosSuccess(responseJson));
        })
        .catch((error) => {
          dispatch(fetchTodosFailure(error));
        });
    }).catch((error) => {
      dispatch(fetchTodosFailure(error));
    })
  };
}
