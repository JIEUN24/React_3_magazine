import { createAction, handleActions } from "redux-actions";
import { produce } from "immer";
import { firestore, storage } from "../../shared/firebase";
import moment from "moment";

import { actionCreators as imageActions } from "./image";

// 액션
const SET_POST = "SET_POST";
const ADD_POST = "ADD_POST";
const EDIT_POST = "EDIT_POST";
const DELETE_POST = "DELETE_POST";
const LOADING = "LOADING";


// 액션 생성 함수
const setPost = createAction(SET_POST, (post_list, paging) => ({post_list, paging}));
const addPost = createAction(ADD_POST, (post) => ({post}));
const editPost = createAction(EDIT_POST, (post_id, post) => ({post_id, post}));
const deletePost = createAction(DELETE_POST, (post_id) => ({post_id}));
const loading = createAction(LOADING, (is_loading) => ({is_loading}));

// 초기값
const initialState = {
  list: [],
  paging: {start: null, next: null, size: 3},
  is_loading: false,
}

// 게시글 하나에는 어떤 정보가 있어야 하는 지 하나 만들어둡시다! :)
const initialPost = {
    image_url: "https://cdn.pixabay.com/photo/2016/02/27/06/43/cherry-blossom-tree-1225186_960" +
            "_720.jpg",
    contents: "2022년 벚꽃!",
    comment_cnt: 0,
    layout: "bottom",
    insert_dt: moment().format("YYYY-MM-DD hh:mm:ss"),
};


// 미들웨어

const editPostFB = (post_id = null, post = {}) => {
  return function (dispatch, getState, {history}) {
    const _image = getState().image.preview;

    if(!post_id) {
      console.log("게시물 정보가 없습니다!")
      return;
    }

    const _post_idx = getState().post.list.findIndex(p => p.id === post_id);
    const _post = getState().post.list[_post_idx];

    console.log(_post);

    const postDB = firestore.collection("post");

    if(_image === _post.image_url) {
      postDB.doc(post_id).update(post).then(doc => {
        dispatch(editPost(post_id, {...post}));
        history.replace("/");
      });

      return;
    } else {
      const user_id = getState().user.user.uid;
      const _upload = storage.ref(`images/${user_id}_${new Date().getTime()}`).putString(_image, "data_url");
      _upload.then(snapshot => {
        snapshot.ref.getDownloadURL().then(url => {
          console.log(url);
  
          return url;
        }).then(url => {
          postDB.doc(post_id).update({...post, image_url: url}).then(doc => {
            dispatch(editPost(post_id, {...post, image_url: url}));
            history.replace("/");
          });
        }).catch((err) => {
          window.alert("앗! 이미지 업로드에 문제가 있어요!");
          console.log("앗! 이미지 업로드에 문제가 있어요!", err);
        })
      });
    }
  }
}

const addPostFB = (contents="", layout = "bottom") => {
  return function (dispatch, getState, {history}) {
    const postDB = firestore.collection("post");

    const _user = getState().user.user;

    const user_info = {
      user_name: _user.user_name,
      user_id: _user.uid,
      user_profile: _user.user_profile,
    }

    const _post = {
      ...initialPost,
      layout,
      contents: contents,
      insert_dt: moment().format("YYYY-MM-DD hh:mm:ss"),
    };
    // console.log(user_info.user_id);
    // console.log({...user_info, ..._post});

    const _image = getState().image.preview;
    // console.log(_image);
    // console.log(typeof _image);

    const _upload = storage.ref(`images/${user_info.user_id}_${new Date().getTime()}`).putString(_image, "data_url");
    _upload.then(snapshot => {
      snapshot.ref.getDownloadURL().then(url => {
        console.log(url);

        return url;
      }).then(url => {
        postDB.add({...user_info, ..._post, image_url: url}).then((doc) => {
          let post = {user_info, ..._post, id: doc.id, image_url: url};
          dispatch(addPost(post));
          history.replace("/");

          dispatch(imageActions.setPreview(null));
    
        }).catch((err) => {
          window.alert("앗! 포스트 작성에 문제가 있어요!");
          console.log("post 작성에 실패했어요.", err);
        });
      }).catch((err) => {
        window.alert("앗! 이미지 업로드에 문제가 있어요!");
        console.log("앗! 이미지 업로드에 문제가 있어요!", err);
      })
    });
  }
}

const getPostFB = (start = null, size = 3) => {
  return function (dispatch, getState, {history}) {

    let _paging = getState().post.paging;

    if(_paging.start && !_paging.next){
      return;
    }

    dispatch(loading(true))
    const postDB = firestore.collection("post")

    // 무한스크롤 준비
    // 파이어베이스에서 원하는 길이만큼의 정보 가져오기
    // inser_dt를 기준으로 내림차순 정렬, 2개까지
    // 여기서 4개씩 가져와서 처리를 하는 이유는 3개까지 가져와서 4번째까지 있다면 다음 것이 있는 것이기 때문
    let query = postDB.orderBy("insert_dt", "desc");

    console.log(query)

    if(start) {
      query = query.startAt(start);
    }

    query
      .limit(size + 1)
      .get()
      .then(docs => {
        let post_list = [];

        let paging = {
          start: docs.docs[0],
          next: docs.docs.length === size+1 ? docs.docs[docs.docs.length - 1] : null,
          size : size,
        }

        docs.forEach((doc) => {

          let _post = {
            id: doc.id,
            ...doc.data()
          };

          let post = {
            id: doc.id,
            user_info: {
              user_name: _post.user_name,
              user_profile: _post.user_profile,
              user_id: _post.user_id
            },
            image_url: _post.image_url,
            contents: _post.contents,
            comment_cnt: _post.comment_cnt,
            layout:_post.layout,
            insert_dt: _post.insert_dt,
          };

        post_list.push(post);
      })
      
      post_list.pop();

      // console.log(post_list)

      dispatch(setPost(post_list, paging));
    })

    return;
    postDB.get().then((docs) => {
      let post_list = [];
      docs.forEach((doc) => {

        let _post = {
          id: doc.id,
          ...doc.data()
        };

        let post = {
          id: doc.id,
          user_info: {
            user_name: _post.user_name,
            user_profile: _post.user_profile,
            user_id: _post.user_id
          },
          image_url: _post.image_url,
          contents: _post.contents,
          comment_cnt: _post.comment_cnt,
          layout:_post.layout,
          insert_dt: _post.insert_dt,
        };

        post_list.push(post);
      })
      
      console.log(post_list)

      dispatch(setPost(post_list));
    })
  }
}

const deletePostFB = (post_id = null) => {
  return function (dispatch, getState, { history }) {
    if (!post_id) {
      console.log("게시물 정보가 없습니다!");
      return;
    }

    const postDB = firestore.collection("post");

    postDB.doc(post_id).delete().then(() => {
      dispatch(deletePost(post_id));
      history.push("/");
    }).catch((err) => {
      console.log("실패!", err);
    })
  };
}


// reducer
export default handleActions(
  {
      [SET_POST]: (state, action) => produce(state, (draft) => {
        draft.list.push(...action.payload.post_list);
        draft.paging = action.payload.paging;
        draft.is_loading = false;
      }),

      [ADD_POST]: (state, action) => produce(state, (draft) => {
        draft.list.unshift(action.payload.post);
      }),

      [EDIT_POST]: (state, action) => produce(state, (draft) => {
        let idx = draft.list.findIndex((p) => p.id === action.payload.post_id);
        draft.list[idx] = {...draft.list[idx], ...action.payload.post};
      }),

      [DELETE_POST]: (state, action) => produce(state, (draft) => {
        draft.list.filter((p) => p.id !== action.payload.post_id);
        window.location.reload();
      }),

      [LOADING]: (state, action) => produce(state, (draft) => {
        draft.is_loading = action.payload.is_loading;
      }),
  },
  initialState
);

// action creator export
const actionCreators = {
  setPost,
  addPost,
  editPost,
  deletePost,
  getPostFB,
  addPostFB,
  editPostFB,
  deletePostFB,
};

export { actionCreators };
