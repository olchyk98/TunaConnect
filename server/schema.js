const {
	GraphQLObjectType,
	GraphQLNonNull,
	GraphQLSchema,
	GraphQLList,
	GraphQLID,
	GraphQLString,
	GraphQLBoolean,
	GraphQLInt
} = require('graphql');
const {
	GraphQLUpload
} = require('apollo-server');

const fileSystem = require('fs');

const {
	User,
	Post,
	Image,
	Comment,
	Conversation,
	Message
} = require('./models');

const settings = require('./settings');

function validateAccount(_id, authToken) {
	return User.findOne({
		_id,
		authTokens: {
			$in: [authToken]
		}
	});
}

function generateNoise(l = 256) {
	let a = "",
		b = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'; // lib

	for(let ma = 0; ma < l; ma++) {
		a += b[Math.floor(Math.random() * b.length)];
	}

	return a;
}

let getExtension = a => a.match(/[^\\]*\.(\w+)$/)[1],
	str = a => a.toString();

const UserType = new GraphQLObjectType({
	name: "User",
	fields: () => ({
		id: { type: GraphQLID },
		login: { type: GraphQLString },
		password: { type: GraphQLString },
		name: { type: GraphQLString },
		avatar: { type: GraphQLString },
		description: { type: GraphQLString },
		cover: { type: GraphQLString },
		gallery: {
			type: new GraphQLList(ImageType),
			resolve: ({ id }) => Image.find({
				creatorID: id,
				targetType: {
					$ne: "COMMENT_TYPE"
				}
			}).sort({ time: -1 })
		},
		galleryImages: {
			type: GraphQLInt,
			resolve: ({ id }) => Image.countDocuments({
				creatorID: id,
				targetType: {
					$ne: "COMMENT_TYPE"
				}
			})
		},
		posts: {
			type: new GraphQLList(PostType),
			resolve: ({ id }) => Post.find({ creatorID: id }).sort({ time: -1 })
		},
		postsInt: {
			type: GraphQLInt,
			resolve: ({ id }) => Post.countDocuments({ creatorID: id }).sort({ time: -1 })
		},
		waitingFriends: { // USERS that are WAITING for this USER
			type: new GraphQLList(UserType),
			resolve: ({ waitingFriends }) => User.find({
				_id: {
					$in: waitingFriends
				}
			})
		},
		waitingFriendsInt: {
			type: GraphQLInt,
			resolve: ({ waitingFriends }) => waitingFriends.length
		},
		friends: {
			type: new GraphQLList(UserType),
			resolve: ({ id, friends }) => User.find({
				$or: [
					{
						_id: {
							$in: friends
						},
					},
					{

						friends: {
							$in: [id]
						}
					}
				]
			})
		},
		friendsInt: {
			type: GraphQLInt,
			async resolve({ id, friends }) {
				let a = await User.countDocuments({
					friends: {
						$in: [id]
					}
				});

				return a + friends.length;
			}
		},
		mutualFriends: {
			type: new GraphQLList(UserType),
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) }
			},
			resolve({ id }, { id: _id }) {
				if(str(id) === str(_id)) return [];

				return User.find({
					$and: [
						{
							friends: {
								$in: [id]
							}
						},
						{
							friends: {
								$in: [_id]
							}
						}
					]
					
				});
			}
		},
		mutualFriendsInt: {
			type: GraphQLInt,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve({ id }, { id: _id }) {
				if(str(id) === str(_id)) return 0;

				let a = await User.countDocuments({
					$and: [
						{
							friends: {
								$in: [id]
							}
						},
						{
							friends: {
								$in: [_id]
							}
						}
					]
				});

				return a || 0;
			}
		},
		authTokens: { type: new GraphQLList(GraphQLString) },
		subscribedTo: {
			type: new GraphQLList(UserType),
			resolve: ({ subscribedTo }) => User.find({
				_id: {
					$in: subscribedTo
				}
			})
		},
		isSubscribed: {
			type: GraphQLBoolean,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve({ id: _id }, { id }) {
				let a = await User.findById(id);
				return a.subscribedTo.includes(str(_id));
			}
		},
		isFriend: {
			type: GraphQLBoolean,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve({ id: _id }, { id }) {
				let a = await User.findOne({
					_id: {
						$in: [_id, id]
					},
					friends: {
						$in: [_id, id]
					}
				});

				return !!a;
			}
		},
		isWaitingFriend: { // user is waiting
			type: GraphQLBoolean,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve({ id: _id }, { id }) {
				let a = await User.countDocuments({
					_id: id,
					waitingFriends: {
						$in: [_id]
					}
				});

				return a || 0;
			}
		},
		isTrialFriend: { // we're waiting
			type: GraphQLBoolean,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) }
			},
			resolve: ({ waitingFriends }, { id }) => waitingFriends.includes(str(id))
		},
		lastAuthToken: {
			type: GraphQLString,
			resolve: ({ authTokens }) => (authTokens.slice(-1) && authTokens.slice(-1)[0]) || ""
		},
		conversations: {
			type: new GraphQLList(ConversationType),
			resolve: ({ id }) => Conversation.find({
				contributors: {
					$in: [id]
				}
			})
		}
	})
});

const PostType = new GraphQLObjectType({
	name: "PostType",
	fields: () => ({
		id: { type: GraphQLID },
		creatorID: { type: GraphQLID },
		content: { type: GraphQLString },
		time: { type: GraphQLString },
		likes: { type: new GraphQLList(GraphQLID) },
		likesInt: {
			type: GraphQLInt,
			resolve: ({ likes }) => likes.length
		},
		isLiked: {
			type: GraphQLBoolean,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) }
			},
			resolve: ({ likes }, { id }) => likes.includes(str(id))
		},
		images: {
			type: new GraphQLList(ImageType),
			resolve: ({ id }) => Image.find({ postID: id })
		},
		creator: {
			type: UserType,
			resolve: ({ creatorID }) => User.findById(creatorID)
		},
		comments: {
			type: new GraphQLList(CommentType),
			resolve: ({ id }) => Comment.find({ postID: id })
		},
		commentsInt: {
			type: GraphQLInt,
			resolve: ({ id }) => Comment.countDocuments({ postID: id })
		}
	})
});

const ImageType = new GraphQLObjectType({
	name: "ImageType",
	fields: () => ({
		id: { type: GraphQLID },
		creatorID: { type: GraphQLID },
		postID: { type: GraphQLString },
		url: { type: GraphQLString },
		time: { type: GraphQLString },
		targetType: { type: GraphQLString },
		likes: { type: new GraphQLList(GraphQLID) },
		isLiked: {
			type: GraphQLBoolean,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) }
			},
			resolve: ({ likes }, { id }) => likes.includes(id)
		},
		likesInt: {
			type: GraphQLInt,
			resolve: ({ likes }) => likes.length
		},
		comments: {
			type: new GraphQLList(CommentType),
			resolve: ({ id }) => Comment.find({ postID: id })
		},
		commentsInt: {
			type: GraphQLInt,
			resolve: ({ id }) => Comment.countDocuments({ postID: id })
		},
		creator: {
			type: UserType,
			resolve: ({ creatorID }) => User.findById(creatorID)
		}
	})
});

const CommentType = new GraphQLObjectType({
	name: "CommentType",
	fields: () => ({
		id: { type: GraphQLID },
		creatorID: { type: GraphQLID },
		postID: { type: GraphQLID },
		content: { type: GraphQLString },
		time: { type: GraphQLString },
		likes: { type: new GraphQLList(GraphQLID) },
		likesInt: {
			type: GraphQLInt,
			resolve: ({ likes }) => likes.length
		},
		isLiked: {
			type: GraphQLBoolean,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) }
			},
			resolve: ({ likes }, { id }) => likes.includes(id)
		},
		comments: {
			type: new GraphQLList(CommentType),
			resolve: ({ id }) => Commnet.find({ postID: id })
		},
		creator: {
			type: UserType,
			resolve: ({ creatorID }) => User.findById(creatorID)
		},
		image: {
			type: ImageType,
			async resolve({ id }) {
				let a = await Image.findOne({ postID: id });

				return a || null;
			}
		}
	})
});

const ConversationType = new GraphQLObjectType({
	name: "Conversation",
	fields: () => ({
		id: { type: GraphQLID },
		name: {
			type: GraphQLString,
			args: {
				id: { type: GraphQLID }
			},
			async resolve({ name, contributors }, { id }) {
				if(name || contributors.length > 2) return name || "Group";

				let a = await User.findById(
					(id) ? (
						contributors.filter(io => str(io) !== str(id))[0]
					) : (
						contributors[0]
					)
				);

				return a && a.name;
				
			}
		},
		color: { type: GraphQLString },
		contributors: {
			type: new GraphQLList(UserType),
			resolve: ({ contributors }) => User.find({
				_id: {
					$in: contributors
				}
			})
		},
		contributorsInt: {
			type: GraphQLInt,
			resolve: ({ contributors }) => contributors.length
		},
		avatar: {
			type: GraphQLString,
			args: {
				id: { type: GraphQLID }
			},
			async resolve({ avatar, contributors }, { id }) {
				if(!avatar) {
					let a = await User.findById(
						(id) ? (
							contributors.filter(io => str(io) !== str(id))[0]
						) : (
							contributors[0]
						)
					);

					return a && a.avatar;
				} else {
					return avatar;
				}
			}
		},
		lastMessage: {
			type: MessageType,
			resolve: async ({ id }) => {
				let a = await Message.find({ conversationID: id }).sort({ time: -1 }).limit(1);
				return a[0];
			}
		},
		messages: {
			type: new GraphQLList(MessageType),
			resolve: ({ id }) => Message.find({ conversationID: id })
		},
		inviteSuggestions: {
			type: new GraphQLList(UserType),
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) }
			},
			async resolve({ contributors }, { id, authToken }) {
				if(!contributors.includes(id)) return null;
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = await User.find({
					friends: {
						$in: [str(id)]
					}
				}).select("_id");

				let c = await User.find({
					_id: {
						$in: [ // all friends
							...a.friends,
							...(b.map(io => io._id))
						]
					},
					_id: { // but not contributors
						$nin: contributors
					}
				});

				return c;
			}
		}
	})
});

const MessageType = new GraphQLObjectType({
	name: "Message",
	fields: () => ({
		id: { type: GraphQLID },
		content: { type: GraphQLString },
		type: { type: GraphQLString },
		time: { type: GraphQLString },
		creatorID: { type: GraphQLID },
		conversationID: { type: GraphQLID },
		isSeen: { type: GraphQLBoolean },
		images: {
			type: new GraphQLList(ImageType),
			resolve: ({ images }) => Image.find({
				_id: {
					$in: images
				}
			})
		},
		creator: {
			type: UserType,
			resolve: ({ creatorID }) => User.findById(creatorID)
		}
	})
})

const RootQuery = new GraphQLObjectType({
	name: "RootQuery",
	fields: {
		users: {
			type: new GraphQLList(UserType),
			resolve: () => User.find({})
		},
		user: {
			type: UserType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: GraphQLString }
			},
			async resolve(_, { id, authToken, targetID }) {
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				return (targetID) ? User.findById(targetID) : a;
			}
		},
		loginExists: {
			type: GraphQLBoolean,
			args: {
				login: { type: new GraphQLNonNull(GraphQLString) }
			},
			resolve: async (_, { login }) => !(await User.findOne({ login }))
		},
		posts: {
			type: new GraphQLList(PostType),
			resolve: () => Post.find({})
		},
		image: {
			type: ImageType,
			args: {
				targetID: { type: new GraphQLNonNull(GraphQLID) }
			},
			resolve: (_, { targetID }) => Image.findById(targetID)
		},
		images: {
			type: new GraphQLList(ImageType),
			resolve: () => Image.find({}).sort({ time: -1 })
		},
		getFeed: {
			type: new GraphQLList(PostType),
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) }
			},
			async resolve(_, { id, authToken }) {
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				return Post.find({
					$or: [
						{
							creatorID: {
								$in: a.subscribedTo
							}
						},
						{ creatorID: id }
					]
				}).sort({ time: -1 });
			}
		},
		searchFriends: {
			type: new GraphQLList(UserType),
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				match: { type: new GraphQLNonNull(GraphQLString) },
				section: { type: new GraphQLNonNull(GraphQLString) }
			},
			async resolve(_, { id, authToken, match, section }) {
				// Validate requester
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = new RegExp(match, "i"), // Create match regex
					c = { // section -> field // convert section to userschema field
						"FRIENDS": "friends",
						"REQUESTS": "waitingFriends"
					}[section];
 
				let d = await User.find({ // select more friends
					[c]: {
						$in: [str(id)]
					}
				}).select("_id");

				a[c] = [ // set all friends into the one array
					...a[c],
					...d
				]

				// Submit response
				return User.find({
					_id: {
						$in: a[c]
					},
					$or: [
						{ name: b },
						{ description: b }
					]
				});
			}
		},
		conversation: {
			type: ConversationType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve(_, { id, authToken, targetID }) {
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = await Conversation.findOne({
					_id: targetID,
					contributors: {
						$in: [str(id)]
					}
				});

				return b;
			}
		},
		searchInConversationInviteSuggestions: {
			type: new GraphQLList(UserType),
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				conversationID: { type: new GraphQLNonNull(GraphQLID) },
				query: { type: new GraphQLNonNull(GraphQLString) }
			},
			async resolve(_, { id, authToken, conversationID, query }) {
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = await Conversation.findOne({
					_id: conversationID,
					contributors: {
						$in: [str(id)]
					}
				});
				if(!b) return null;

				let c = await User.find({
					friends: {
						$in: [str(id)]
					}
				}).select("_id");

				return User.find({
					name: new RegExp(query, "i"),
					_id: {
						$in: [
							...a.friends,
							...(c.map(io => io._id))
						]
					},
					_id: {
						$nin: b.contributors
					}
				});
			}
		}
	}
});

const RootMutation = new GraphQLObjectType({
	name: "RootMutation",
	fields: {
		registerUser: {
			type: UserType,
			args: {
				login: { type: new GraphQLNonNull(GraphQLString) },
				password: { type: new GraphQLNonNull(GraphQLString) },
				name: { type: new GraphQLNonNull(GraphQLString) },
				avatar: { type: new GraphQLNonNull(GraphQLUpload) }
			},
			async resolve(_, { login, password, name, avatar }) {
				{
					let a = await User.findOne({ login });
					if(a) return null;
				}

				let token = generateNoise();

				// receive image
				if(avatar) {					
					let { filename, stream } = await avatar;
					var avatarPath = `${ settings.files.avatars }/${ generateNoise(128) }.${ getExtension(filename) }`

					stream.pipe(fileSystem.createWriteStream('.' + avatarPath));
				}

				let user = await (new User({
					login, password, name,
					avatar: avatarPath || settings.default.avatar,
					description: "",
					waitingFriends: [],
					friends: [],
					cover: settings.default.cover,
					authTokens: [token]
				})).save();

				return user;
			}
		},
		loginUser: {
			type: UserType,
			args: {
				login: { type: new GraphQLNonNull(GraphQLString) },
				password: { type: new GraphQLNonNull(GraphQLString) }
			},
			resolve(_, { login, password }) {
				return User.findOneAndUpdate({ login, password }, {
					$push: {
						authTokens: generateNoise() 
					}
				}, (__, a) => a);
			}
		},
		publishPost: {
			type: PostType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				content: { type: GraphQLString },
				images: { type: new GraphQLList(new GraphQLNonNull(GraphQLUpload)) }
			},
			async resolve(_, { id, authToken, content, images }) {
				if(!content && (!images || !images.length)) return null;
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				// Publish
				let post = await (
					new Post({
						creatorID: id,
						content,
						time: new Date,
						likes: []
					})
				).save();

				if(images && images.length) {
					post.images = [];

					await (new Promise(resolve => {
						images.forEach(async (io, index, arr) => {
							let { stream, filename } = await io;

							let link = `${ settings.files.images }/${ generateNoise(128) }.${ getExtension(filename) }`;
							stream.pipe(fileSystem.createWriteStream('.' + link));

							let b = await (
								new Image({
									creatorID: id,
									postID: post._id,
									url: link,
									time: new Date,
									likes: [],
									targetType: "POST_TYPE"
								})
							).save();
							post.images.push(b);
							if(index === arr.length - 1) resolve(true);
						});
					}));
				}

				return post;
			}
		},
		commentItem: {
			type: CommentType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: new GraphQLNonNull(GraphQLID) },
				content: { type: GraphQLString },
				image: { type: GraphQLUpload }
			},
			async resolve(_, { id, authToken, targetID, content, image }) {
				// Global validation
				if(!content && !image) return null;
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				// Target validation
				let inTarget = false;
				{
					let b = [
						"Post",
						"Comment",
						"Image"
					];

					for(let io of b) {
						let c = eval(io);
						// if(!c) continue;
						let d = await c.findById(targetID);

						if(d) {
							inTarget = true;
							break;
						}
					}
				}
				if(!inTarget) return null;

				// Publish comment
				const comment = await (
					new Comment({
						creatorID: id,
						postID: targetID,
						content,
						time: new Date,
						likes: []
					})
				).save();

				// Receive image
				if(image) {
					let { stream, filename } = await image;

					let link = `${ settings.files.images }/${ generateNoise(128) }.${ getExtension(filename) }`;
					stream.pipe(fileSystem.createWriteStream('.' + link));

					await (new Image({
						creatorID: id,
						postID: comment._id,
						url: link,
						time: new Date,
						likes: [],
						targetType: "COMMENT_TYPE"
					})).save();
				}

				return comment;
			}
		},
		likePost: {
			type: PostType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve(_, { id, authToken, targetID }) {
				let a = await validateAccount(id, authToken);
				if(!a || !targetID) return null;

				let b = await Post.findById(targetID);
				if(!b) return null;

				let c = !b.likes.includes(id);

				await b.updateOne({
					[ (c) ? '$addToSet': '$pull' ]: {
						likes: id
					}
				});

				if(c) {
					b.likes.push(id)
				} else {
					b.likes.splice(b.likes.findIndex(io => str(io) === str(id)), 1);
				}

				return b;
			}
		},
		likeComment: {
			type: CommentType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve(_, { id, authToken, targetID }) {
				let a = await validateAccount(id, authToken);
				if(!a || !targetID) return null;

				let b = await Comment.findById(targetID);
				if(!b) return null;

				let c = !b.likes.includes(id);

				await b.updateOne({
					[ (c) ? '$addToSet': '$pull' ]: {
						likes: id
					}
				});

				if(c) {
					b.likes.push(id);
				} else {
					b.likes.splice(b.likes.findIndex(io => str(io) === str(id)), 1);
				}

				return b;
			}
		},
		likeImage: {
			type: ImageType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve(_, { id, authToken, targetID }) {
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = await Image.findById(targetID);
				if(!b) return null;

				let c = !b.likes.includes(id);

				await b.updateOne({
					[ (c) ? '$addToSet': '$pull' ]: {
						likes: id
					}
				});

				if(c) {
					b.likes.push(id);
				} else {
					b.likes.splice(b.likes.findIndex(io => str(io) === str(id)), 1);
				}

				return b;
			}
		},
		setUserAvatar: {
			type: UserType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				avatar: { type: new GraphQLNonNull(GraphQLUpload) }
			},
			async resolve(_, { id, authToken, avatar }) {
				// Receive image
				let { stream, filename } = await avatar;

				let link = `${ settings.files.images }/${ generateNoise(128) }.${ getExtension(filename) }`;
				stream.pipe(fileSystem.createWriteStream('.' + link));

				// Submit
				return User.findOneAndUpdate({
					_id: id,
					authTokens: {
						$in: [authToken]
					}
				}, {
					avatar: link
				}, (_, a) => a);
			}
		},
		setUserCover: {
			type: UserType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				cover: { type: new GraphQLNonNull(GraphQLUpload) }
			},
			async resolve(_, { id, authToken, cover }) {
				// Receive image
				let { stream, filename } = await cover;

				let link = `${ settings.files.images }/${ generateNoise(128) }.${ getExtension(filename) }`;
				stream.pipe(fileSystem.createWriteStream('.' + link));

				// Submit
				return User.findOneAndUpdate({
					_id: id,
					authTokens: {
						$in: [authToken]
					}
				}, {
					cover: link
				}, (_, a) => a);
			}
		},
		uploadImage: {
			type: ImageType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				avatar: { type: new GraphQLNonNull(GraphQLUpload) }
			},
			async resolve(_, { id, authToken, avatar }) {
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let { stream, filename } = await avatar;
				let link = `${ settings.files.images }/${ generateNoise(128) }.${ getExtension(filename) }`;
				stream.pipe(fileSystem.createWriteStream('.' + link));

				let b = (
					new Image({
						creatorID: a._id,
						postID: null,
						url: link,
						time: new Date,
						likes: [],
						targetType: "VOID_TYPE"
					})
				).save();

				return b;
			}
		},
		processFriendRequest: {
			// send request, cancel request, accept request, remove from friends
			type: UserType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve(_, { id, authToken, targetID }) {
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = await User.findById(targetID);
				if(!b) return null;

				if( // Send request
					(
						!a.friends.includes(str(targetID)) &&
						!a.waitingFriends.includes(str(targetID))
					) && (
						!b.friends.includes(str(id)) &&
						!b.waitingFriends.includes(str(id))
					)
				) {
					await b.updateOne({
						$addToSet: {
							waitingFriends: str(id)
						}
					});

					b.waitingFriends.push(str(id));
				} else if( // Cancel request
					(
						!a.friends.includes(str(targetID)) &&
						!a.waitingFriends.includes(str(targetID))
					) && (
						!b.friends.includes(str(id)) &&
						b.waitingFriends.includes(str(id))
					)
				) {
					await b.updateOne({
						$pull: {
							waitingFriends: str(id)
						}
					});

					b.waitingFriends.splice(b.waitingFriends.findIndex(io => str(io) === str(targetID)), 1);
				} else if( // Accept friend
					(
						!a.friends.includes(str(targetID)) &&
						a.waitingFriends.includes(str(targetID))
					) && (
						!b.friends.includes(str(id)) &&
						!b.waitingFriends.includes(str(id))
					)
				) {
					await a.updateOne({
						$pull: {
							waitingFriends: str(targetID)
						},
						$addToSet: {
							friends: str(targetID)
						}
					});

					b.waitingFriends.splice(b.waitingFriends.findIndex(io => str(io) === str(targetID)), 1);
					b.friends.push(str(targetID));
				} else if( // Remove friend
					(
						!a.waitingFriends.includes(str(targetID)) &&
						!b.waitingFriends.includes(str(id))
					) && (
						a.friends.includes(str(targetID)) ||
						b.friends.includes(str(id))
					)
				) {
					await a.updateOne({
						$pull: {
							friends: str(targetID)
						}
					});

					await b.updateOne({
						$pull: {
							friends: str(id)
						}
					});
				}

				return b;

			}
		},
		subscribeUser: {
			type: UserType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: new GraphQLNonNull(GraphQLID) } 
			},
			async resolve(_, { id, authToken, targetID }) {
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = await User.findById(targetID);
				if(!b) return null;

				let c = a.subscribedTo;
				let d = c.includes(str(targetID));

				await a.updateOne({
					[ (!d) ? "$addToSet" : "$pull" ]: {
						subscribedTo: str(targetID)
					}
				});

				if(!d) c.push(str(targetID));
				else c.splice(c.findIndex(io => str(io) === str(targetID)), 1);

				return b;
			}
		},
		declareFriendRequestStatus: {
			type: UserType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: new GraphQLNonNull(GraphQLID) },
				status: { type: new GraphQLNonNull(GraphQLString) }
			},
			async resolve(_, { id, authToken, targetID, status }) {
				let a = await validateAccount(id, authToken);
				switch(status) {
					case 'ACCEPT_ACTION':
						await a.updateOne({
							$pull: {
								waitingFriends: targetID
							},
							$addToSet: {
								friends: targetID
							}
						});
					break;
					case 'DECLINE_ACTION':
						await a.updateOne({
							$pull: {
								waitingFriends: targetID
							}
						});
					break;
					case 'REMOVE_ACTION':
						await a.updateOne({
							$pull: {
								friends: str(targetID)
							}
						});

						await User.findOneAndUpdate({
							_id: targetID
						}, {
							$pull: {
								friends: str(id)
							}
						});
					break;
					default:break;
				}
				return a;
			}
		},
		updateProfileDescription: {
			type: UserType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				content: { type: new GraphQLNonNull(GraphQLString) }
			},
			resolve: (_, { id, authToken, content }) => User.findOneAndUpdate({
				_id: id,
				authTokens: {
					$in: [authToken]
				}
			}, {
				description: content
			})
		},
		settingProfile: {
			type: UserType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				name: { type: GraphQLString },
				login: { type: GraphQLString },
				password: { type: GraphQLString }
			},
			resolve(_, { id, authToken, name, login, password }) {
				let a = {};

				if(name) a.name = name;
				if(login) a.login = login;
				if(password) a.password = password;
				if(!Object.values(a).length) return null;
				
				return User.findOneAndUpdate({
					_id: id,
					authTokens: {
						$in: [authToken]
					}
				}, a, (_, a) => a);
			}
		},
		createConversation: {
			type: ConversationType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				targetID: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve(_, { id, authToken, targetID }) {
				// Validate init contributors
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = await User.findById(targetID);
				if(!b) return null;

				// Validate if the conversation exists
				let c = Conversation.findOne({
					$or: [ // XXX
						{
							contributors: [
								str(id),
								str(targetID)
							]
						},
						{
							contributors: [
								str(targetID),
								str(id)
							]
						}
					]
				});

				if(c) return c;

				// Create a new conversation
				let d = await (
					new Conversation({
						name: "",
						avatar: "",
						contributors: [
							str(id),
							str(targetID)
						],
						creatorID: str(id),
						color: "white"
					})
				).save();

				// Send the new conversation's data
				return d;
			}
		},
		sendMessage: {
			type: MessageType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				content: { type: GraphQLUpload }, // takes any type of data (string, object)
				type: { type: new GraphQLNonNull(GraphQLString) },
				conversationID: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve(_, { id, authToken, content, type, conversationID }) {
				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = await Conversation.findOne({
					contributors: {
						$in: [str(id)]
					},
					_id: conversationID
				});
				if(!b) return null;

				let images = [];
				if(type === "FILE_TYPE") { // Download file and return url as value
					let { filename, stream } = await content;
					content = `${ settings.files.files }/${ generateNoise(128) }.${ getExtension(filename) }`

					stream.pipe(fileSystem.createWriteStream('.' + content));
				} else if(type === "IMAGES_TYPE") {
					images = Array.from(content);
					content = "";
				}

				let c = await (
					new Message({
						time: new Date,
						content,
						type,
						creatorID: str(id),
						conversationID,
						isSeen: false,
						images
					})
				).save();

				return c;
			}
		},
		addUserToConversation: {
			type: UserType,
			args: {
				id: { type: new GraphQLNonNull(GraphQLID) },
				authToken: { type: new GraphQLNonNull(GraphQLString) },
				conversationID: { type: new GraphQLNonNull(GraphQLID) },
				targetID: { type: new GraphQLNonNull(GraphQLID) }
			},
			async resolve(_, { id, authToken, conversationID, targetID }) {
				// validate user (+)
				// validate if conversation exists (+)
				// validate if user is in conversation
				// validate if target exists (+)
				// validate if target is friend for user (+)
				// add target to the conversation |addToSet!| (+)
				// send system message in conversation

				let a = await validateAccount(id, authToken);
				if(!a) return null;

				let b = await Conversation.findById(conversationID);
				if(!b) return null;

				let c = await User.findById(targetID);
				if(
					!c ||
					(
						!c.friends.includes(str(id)) &&
						!a.friends.includes(str(targetID))
					)
				) return null;

				await b.updateOne({
					$addToSet: {
						contributors: str(targetID)
					}
				});

				return c;
			}
		}
	}
});

module.exports = new GraphQLSchema({
	query: RootQuery,
	mutation: RootMutation
});