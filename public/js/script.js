
    //creating a filter for the date since date stored in the table is not in the format required to be shown in the browser
    //<p class="img-date">-{{created_at | date}}</p> | date is a filter defined below
    Vue.filter('date', (date) => {
        //date will contain the created_at variable
        return (new Date(date)).toDateString();
        //this function expects that I will pass something
    });
    //big image is a custom component being created by us:
    Vue.component('big-image', {
        // we pass this props: id from the main vue to this component to talk to each other.
        props: ['id'],
        data: function() {
            return {
                title: '',
                description: '',
                username: '',
                image: '',
                created_at: '',
                comments: [],
                newComment: {}
            };
        },
        methods: {
            closeModal: function() {
                //we cant access the currentImage property of the main Vue App and directly change it
                //so we emit an event here
                //v-on:changed="currentImage=null"
                //the above line catches the event emitted and changed the currentImage property since it has
                //access to it
                //I am emitting an event changed here and catching it in my html:
                this.$emit('changed');
            },
            uploadComment: function() {
                axios.post('/upload-messages', {
                    // we could declare 3 variables (id, username,text) here (json) or in our html(v-mode) or in the data part.
                    //this first part: id, username and text are in the post request because we are sending this information from the client to the server:
                    //and the server will put the details in the database.
                    "id" : this.id, //this id comes from props.
                    "username": this.newComment.username,
                    "text": this.newComment.text
                })
                //creating a new comment object so that this is shown directly in the browser

                newCommentObject = {
                //this secont part:comment, username and created_at: is for pushing the newCommentObject into the commentsarray so that,
                //it is immediately visible for the users!
                    "comment" : this.newComment.text,
                    "username" : this.newComment.username,
                    "created_at" : (new Date()).toISOString()
                }
                //push this to the already available comment array of the component
                this.comments.push(newCommentObject);
                //to clear the input fields/the forms:
                this.newComment.username = "";
                this.newComment.text = "";
                console.log('this is new comment:', this.newComment)
            }
        },
        template:'#myTemplate',

        mounted: function() {
            //this function runs as soon as the component is loaded in the front end
            //gets all the details required to be shown to the front end
            //MOUNTED IS THE MOST IMPORTANT PART, you will put some function that you will need to initiallize your data!
            //it runs inmediately
            console.log('running mounted of big image');
            axios.get('/image/' + this.id) //this.id = id:"currentimage" = props: id!!
            .then(result => {
                console.log('this is our results', result.data)
                //this: big-images//image, title, descript... > information that I defined earliert in the data function and I am
                //setting them!! setting = putting values to it! it will run automatically
                //164: server: that is how I am passing the response:
                // result.data: variables that are set in the createClient//imageData: server and // image: table from sql!
                this.image = result.data.imageData.image,
                this.title = result.data.imageData.title,
                this.description = result.data.imageData.description,
                this.username = result.data.imageData.username,
                this.created_at = result.data.imageData.created_at,
                this.comments = result.data.comment //165 server : comment
            })
                .catch(e => console.log('there was an error with GET/image/:id', e))
        },

    })


    //the main root component
    var app = new Vue({
        el:'#main',
        data: {
            images: [],
            currentImage: null,
            moreImages : false, //the load more button will not be visible initially
            //this is for the form:
            formStuff: {
                title: '',
                Description: '',
                username: '',
                file: ''
            }
        },
        methods: {
            uploadFile: function() {
                console.log('uploadFile running');
                const fd = new FormData();
                fd.append('file', this.formStuff.file)
                fd.append('title', this.formStuff.title)
                fd.append('description', this.formStuff.description)
                fd.append('username', this.formStuff.username)
                this.formStuff.title = '';
                this.formStuff.description = '';
                this.formStuff.username = '';
                this.formStuff.file = '';
                document.getElementById('file').value = ''; //line 21html to reset this input file, clear the form, we use normal JS
                axios.post('/upload-image', fd)
                .then(result => {
                    console.log('response from server: ', result)
                    axios.get('/images')
                    .then((resp) => {
                        //if imagesleft is not 0 then show the load more button
                        //for i.e: there were 3 images before and we upload one more image
                        //the show more button becomes visible
                        if(resp.data.imagesLeft != 0)
                        this.moreImages = true;
                        // request the 3 new images to see them in the browser!
                        this.images = resp.data.images;
                    })
                });
            },
            //sets the current Image property that is used by the big image component
            setCurrentImage: function(id) {
                this.currentImage = id
            },

            //as soon as a change is detected on select file component we set the value
            chooseFile: function(e){
                e.preventDefault();
                console.log('chooseFile running');
                // you want to select a file by file (1x1), we are only sending one file at the time.
                this.formStuff.file = e.target.files[0]
            },

            //clicking on load more we get the more images path
            loadMoreImages: function() {
                axios.get('/more-images')
                    .then((resp) => {
                        //if imagesleft is 0 then hide the load more button
                        if(resp.data.imagesLeft == 0)
                            this.moreImages = false;
                        //this images contains one array: and resp.data.images contains another array
                        //and concat put them together!!
                        this.images = this.images.concat(resp.data.images);
                    })
                    .catch(e => console.log('there was an error with GET/image',e));
            }
        },
        mounted: function() {
            //as soon as the front page loads get the image data from the server
            axios.get('/images')
                .then((resp) => {
                    //if imagesleft is not 0 then show the load more button
                    if(resp.data.imagesLeft != 0)
                        //this = viewApp
                        //moreImages a variable main app 83:
                        this.moreImages = true;
                        this.images = resp.data.images;
                        console.log(resp.data);
                })
                .catch(e => console.log('there was an error with GET/image',e))
        }
    });
