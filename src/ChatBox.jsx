import React, {
  Component
} from 'react';
import Box from '3box';
import PropTypes from 'prop-types';
import resolve from 'did-resolver';
import registerResolver from '3id-resolver';

import {
  sortChronologicallyAndGroup,
  isLikeEvent,
  resolveLikes,
  checkIsMobileDevice,
} from './utils';

import Launcher from './components/Launcher';
import ChatWindow from './components/ChatWindow';
import './index.scss';

class ChatBox extends Component {
  constructor(props) {
    super(props);
    const {
      agentProfile,
      showEmoji,
      currentUserAddr,
      box,
      ethereum,
      colorTheme,
      popupChat,
      mute,
      openOnMount,
    } = this.props;

    this.state = {
      agentProfile: agentProfile || {
        chatName: 'Chatbox',
        imageUrl: null
      },
      colorTheme: colorTheme,
      showEmoji,
      popupChat,
      isOpen: checkIsMobileDevice() ? false : openOnMount,
      isJoiningThread: true,
      newMessagesCount: 0,
      updateCommentsCount: 0,
      membersOnlineLength: 1,
      mute,
      dialogue: [],
      likes: new Map(),
      uniqueUsers: [],
      membersOnline: [],
      addedMembers: [],
      addedModerators: null,
      thread: {},
      profiles: {},
      currentUser3BoxProfile: {},
      box,
      currentUserAddr,
      ethereum: ethereum || window.ethereum,
      threadExists: false,
      inputWarning: null
    }
  }

  async componentDidMount() {
    const { currentUser3BoxProfile } = this.props;

    // get ipfs instance for did-resolver
    const IPFS = await Box.getIPFS();
    registerResolver(IPFS);

    if ((!currentUser3BoxProfile || !Object.entries(currentUser3BoxProfile).length)) {
      await this.fetchMe();
    }

    this.fetchThread();
  }

  fetchThread = async () => {
    const {
      ethereum,
      currentUserAddr
    } = this.state;
    const {
      spaceName,
      threadName,
      persistent,
      open,
      firstModerator,
      onLoad
    } = this.props;

    setTimeout(() => this.setState({ isJoiningThread: false }), 5000);

    if (!spaceName || !threadName) console.error('You must pass both spaceName and threadName props');
    if (!ethereum) console.error('Chatbox component must have ethereum provider to fully operate');

    const myAddr = currentUserAddr || ethereum.selectedAddress;
    const moderatorAddr = firstModerator || myAddr;
    const options = persistent ? {
      firstModerator: moderatorAddr,
      members: !open
    } : {
      ghost: true
    };

    try{
      const box = await Box.create(ethereum);
      if (persistent) {
        const spaces = await Box.listSpaces(myAddr);
        if (!spaces || !spaces.includes(spaceName)) {
          // need to authenticate before openSpace
          await box.auth([spaceName], { address: myAddr });
          if (moderatorAddr === myAddr) {
            // the moderator need to openSpace first, before others can be added
            await box.openSpace(spaceName);
          } else {
            // other accounts still need to openSpace, but can do it asynchronously
            box.openSpace(spaceName)
              .then(space => console.log(`open space ${spaceName} completed`, space))
              .catch(err => console.log(`open space ${spaceName} failed`, err));
          }
        }
      }
      const thread = await box.openThread(spaceName, threadName, options);
      const dialogue = await thread.getPosts();
      const threadExists = true;

      if (onLoad && typeof(onLoad) === 'function') {
        const likes = resolveLikes(dialogue)
        const messages = dialogue.filter(({ message }) => !isLikeEvent(message))
        onLoad({
          messages,
          likes,
          thread
        });
      }

      this.setState({ thread, box, dialogue, threadExists }, async () => {
        await this.updateComments(true);
        thread.onUpdate(() => {
          this.updateComments();
        });

        if (!persistent || !open) {
          // update members if Ghost Thread, or a members-only Persistent Thread
          await this.updateMembersOnline();
          thread.onNewCapabilities(() => this.updateMembersOnline());
        }
        if (persistent && !open) {
          // add members and moderators if a members-only Persistent Thread
          await this.addMembers();
          await this.addModerators();
        }
      });
    } catch(error) {
      console.error("failed when fetch thread", error);
      let threadExists = true;
      if (persistent && firstModerator && currentUserAddr && currentUserAddr !== firstModerator) {
        threadExists = false;
      }
      this.setState({ threadExists });
    }
  }

  openBox = async () => {
    const {
      ethereum,
      box,
      currentUserAddr,
    } = this.state;
    const { spaceName } = this.props;

    if (!ethereum) return console.error('You must provide an ethereum object to the comments component.');

    await box.auth([spaceName], { address: this.props.currentUserAddr || currentUserAddr });
    this.setState({ hasAuthed: true });

    await box.syncDone;
  }

  fetchMe = async () => {
    const { profiles, ethereum } = this.state;
    const { currentUserAddr, userProfileURL } = this.props;

    if (!ethereum) return console.error('No web3');

    let myAddress;
    if (currentUserAddr) {
      myAddress = currentUserAddr;
    } else {
      const addresses = await ethereum.enable();
      myAddress = addresses[0];
    }

    const currentUser3BoxProfile = await Box.getProfile(myAddress);
    currentUser3BoxProfile.profileURL = userProfileURL ? userProfileURL(myAddress) : `https://3box.io/${myAddress}`;
    currentUser3BoxProfile.ethAddr = myAddress;

    profiles[myAddress] = currentUser3BoxProfile;

    this.setState({ currentUser3BoxProfile, profiles, currentUserAddr: myAddress });
  }

  // get profiles of commenters from public api only on component mount
  fetchProfiles = async (uniqueUsers) => {
    const { profiles, currentUser3BoxProfile, currentUserAddr } = this.state;

    const profilesToUpdate = uniqueUsers.filter((did, i) => !profiles[uniqueUsers[i]]);

    if (!profilesToUpdate.length) return;

    const fetchProfile = async (did) => await Box.getProfile(did);
    const fetchAllProfiles = async () => await Promise.all(profilesToUpdate.map(did => fetchProfile(did)));
    const profilesArray = await fetchAllProfiles();

    const getEthAddr = async (did) => await resolve(did);
    const getAllEthAddr = async () => await Promise.all(profilesToUpdate.map(did => getEthAddr(did)));
    const ethAddrArray = await getAllEthAddr();

    profilesArray.forEach((profile, i) => {
      const { userProfileURL } = this.props;
      const ethAddr = ethAddrArray[i].publicKey[2].ethereumAddress;
      profile.ethAddr = ethAddr;
      profile.profileURL = userProfileURL ? userProfileURL(ethAddr) : `https://3box.io/${ethAddr}`;
      profiles[profilesToUpdate[i]] = profile;
    });

    if (currentUserAddr) profiles[currentUserAddr] = currentUser3BoxProfile;

    this.setState({
      profiles,
    });
  }

  updateComments = async (local) => {
    const { onUpdate } = this.props;
    const {
      thread,
      uniqueUsers,
      newMessagesCount,
      dialogueLength,
      updateCommentsCount,
      isJoiningThread
    } = this.state;

    if (!thread) return;
    if (isJoiningThread) this.setState({ isJoiningThread: false });

    const updatedUnsortedDialogue = await thread.getPosts();
    const likes = resolveLikes(updatedUnsortedDialogue)
    const filteredDialogue = updatedUnsortedDialogue.filter(({ message }) => !isLikeEvent(message))
    const newDialogueLength = filteredDialogue.length;
    const updatedDialogue = sortChronologicallyAndGroup(filteredDialogue);

    // if there are new messagers, fetch their profiles
    const updatedUniqueUsers = [...new Set(updatedUnsortedDialogue.map(x => x.author))];

    // onUpdate callback
    // "local" means the update is triggered locally
    if (onUpdate && typeof (onUpdate) === 'function' && !local) {
      onUpdate({
        messages: filteredDialogue,
        likes,
        thread
      });
    }

    // count new messages for when popup closed
    const numNewMessages = newDialogueLength - dialogueLength;
    let totalNewMessages = newMessagesCount;
    totalNewMessages += numNewMessages;
    if (uniqueUsers.length === updatedUniqueUsers.length) {
      this.setState({
        dialogue: updatedDialogue,
        newMessagesCount: totalNewMessages || 0,
        dialogueLength: newDialogueLength,
        likes
      });
    } else {
      await this.fetchProfiles(updatedUniqueUsers);
      this.setState({
        dialogue: updatedDialogue,
        newMessagesCount: totalNewMessages || 0,
        dialogueLength: newDialogueLength,
        uniqueUsers: updatedUniqueUsers,
        likes
      });
    }

    this.setState({ updateCommentsCount: updateCommentsCount + 1 });
  }

  updateMembersOnline = async () => {
    const { thread, currentUserAddr } = this.state;

    // merge members and moderators
    let members = await thread.listMembers();
    let moderators = await thread.listModerators();
    let nonModerators = members.filter(m => !moderators.includes(m));
    const updatedMembersOnline = moderators.concat(nonModerators);

    await this.fetchProfiles(updatedMembersOnline);
    // if (currentUserAddr) updatedMembersOnline.push(currentUserAddr);

    // update members and moderator addresses
    const addedMembers = await this.getEthAddresses(updatedMembersOnline);
    const addedModerators = await this.getEthAddresses(moderators);

    this.setState({
      membersOnline: updatedMembersOnline,
      membersOnlineLength: updatedMembersOnline.length,
      addedMembers,
      addedModerators
    });
  }

  getEthAddresses = async (users) => {
    const getEthAddr = async (did) => {
      if (did.slice(0, 4) === "did:") {
        const profile = await resolve(did);
        if (profile) {
          return profile.publicKey[2].ethereumAddress.toLowerCase();
        }
      }
      return did;
    };
    const getAllEthAddr = async () => await Promise.all(users.map(did => getEthAddr(did)));
    const addresses = await getAllEthAddr();
    return addresses;
  }

  addMembers = async (members) => {
    const { thread, currentUserAddr } = this.state;
    const { persistent, open } = this.props;
    members = members || this.props.members;
    const registerMember = async (m) => {
      try {
        if (m) {
          const p = await Box.getProfile(m);
          if (p && Object.keys(p) && Object.keys(p).length > 0) {
            await thread.addMember(m);
          }
        }
      } catch(e) {
        // console.log(`Failed when adding member ${m}`, e);
      }
    }

    // add members into thread
    if (persistent && !open && members && members.length > 0 && currentUserAddr) {
      const isAdmin = await this.canModerate();
      if (isAdmin) {
        const addedMembers = this.state.addedMembers || [];
        const newMembers = members.filter(m => !addedMembers.includes(m.toLowerCase()));
        if (newMembers && newMembers.length > 0) {
          const { hasAuthed } = this.state;
          try {
            if (!hasAuthed) await this.openBox();
            await Promise.all(newMembers.map(m => registerMember(m)));
            const updatedMembers = await thread.listMembers();
            const updatedMemberAddrs = await this.getEthAddresses(updatedMembers);
            console.log("current members", updatedMemberAddrs);
          } catch (error) {
            console.error('There was an error adding new members', error);
          }
        }
      }
    }
  }

  addModerators = async (moderators) => {
    const { thread, currentUserAddr } = this.state;
    const { persistent, open } = this.props;
    const addedModerators = this.state.addedModerators || [];
    moderators = moderators || this.props.moderators;
    const registerModerator = async (m) => {
      try {
        if (m) {
          const p = await Box.getProfile(m);
          if (p && Object.keys(p) && Object.keys(p).length > 0) {
            await thread.addModerator(m);
          }
        }
      } catch (e) {
        // console.log(`Failed when adding moderator ${m}`);
      }
    }

    // add moderators into thread
    if (persistent && !open && moderators && moderators.length > 0 && currentUserAddr) {
      const isAdmin = await this.canModerate();
      if (isAdmin) {
        const newModerators = moderators.filter(m => !addedModerators.includes(m.toLowerCase()));
        if (newModerators && newModerators.length > 0) {
          const { hasAuthed } = this.state;
          try {
            if (!hasAuthed) await this.openBox();
            await Promise.all(newModerators.map(m => registerModerator(m)));
            const updatedModerators = await thread.listModerators();
            const updatedModeratorAddrs = await this.getEthAddresses(updatedModerators);
            console.log("current moderators", updatedModeratorAddrs);
          } catch (error) {
            console.error('There was an error adding new moderators', error);
          }
        }
      }
    }
  }

  handleClick = () => {
    this.setState({
      isOpen: !this.state.isOpen,
      newMessagesCount: 0
    });
  }

  canModerate = async () => {
    const { thread, currentUserAddr } = this.state;
    let addedModerators = this.state.addedModerators;

    if (!thread || !currentUserAddr) return false;

    if (!addedModerators) {
      const moderators = await thread.listModerators();
      addedModerators = await this.getEthAddresses(moderators);
      addedModerators = addedModerators || [];
      this.setState({ addedModerators })
    }

    return addedModerators.includes(currentUserAddr.toLowerCase());
  }

  canPost = async () => {
    const { persistent, open, firstModerator, members, moderators, onError } = this.props;
    let { currentUserAddr, addedModerators } = this.state;

    if (!persistent || open) {
      // Ghost Thread, or Open Thread
      return true;
    } else if (firstModerator && currentUserAddr && firstModerator.toLowerCase() === currentUserAddr.toLowerCase()) {
      // the first moderator of the thread
      return true;
    } else {
      const addedMembers = this.state.addedMembers || [];
      if (currentUserAddr && addedMembers.includes(currentUserAddr.toLowerCase())) {
        // a member or a moderator of the thread
        return true;
      } else {
        const moderator = firstModerator || '';
        const showError = (msg) => this.setWarning(msg);
        let message = `You're not a member of the thread. Please contact the moderator ${moderator}`;
        if (onError) {
          message = onError(new Error(message), {
            currentUserAddr,
            addedMembers,
            addedModerators,
            members,
            moderators,
            firstModerator
          }, showError);
        }
        if (message) {
          showError(message);
        }
      }
    }
    return false;
  }

  postMessage = async (message) => {
    const { hasAuthed, ethereum, currentUserAddr,
      addedMembers, addedModerators } = this.state;
    const { firstModerator, members, moderators, onError } = this.props;

    if (!ethereum) return;
    const allowed = await this.canPost();
    if (!allowed) return ;
    try {
      if (!hasAuthed) await this.openBox();
      await this.state.thread.post(message.data.text || message.data.emoji);
      await this.updateComments(true);
    } catch (error) {
      console.error('There was an error saving your message', error);
      const showError = (msg) => this.setWarning(msg);
      let message = error.message;
      if (onError) {
        message = onError(error, {
          currentUserAddr,
          addedMembers,
          addedModerators,
          members,
          moderators,
          firstModerator
        }, showError);
      }
      if (message) {
        showError(message);
      }
    }
  }

  setWarning = (inputWarning ) => {
    this.setState({ inputWarning });
    setTimeout(() => {
      this.setState({ inputWarning : null });
    }, 10000);
  }

  render() {
    const {
      dialogue,
      currentUserAddr,
      profiles,
      currentUser3BoxProfile,
      agentProfile,
      colorTheme,
      showEmoji,
      popupChat,
      newMessagesCount,
      mute,
      membersOnlineLength,
      ethereum,
      box,
      membersOnline,
      likes,
      isJoiningThread,
      isOpen,
      threadExists,
      inputWarning
    } = this.state;
    const { loginFunction, userProfileURL } = this.props;

    const noWeb3 = !box && !loginFunction && !ethereum;

    if (!threadExists) {
      return <div></div>
    }

    if (popupChat) {
      return (
        <Launcher
          postMessage={this.postMessage}
          handleClick={this.handleClick}
          resetNewMessageCounter={this.resetNewMessageCounter}
          agentProfile={agentProfile}
          loginFunction={loginFunction}
          messageList={dialogue}
          likes={likes}
          showEmoji={showEmoji}
          currentUserAddr={currentUserAddr}
          currentUser3BoxProfile={currentUser3BoxProfile}
          profiles={profiles}
          colorTheme={colorTheme}
          isOpen={isOpen}
          newMessagesCount={newMessagesCount}
          mute={mute}
          membersOnlineLength={membersOnlineLength}
          membersOnline={membersOnline}
          ethereum={ethereum}
          noWeb3={noWeb3}
          popupChat={popupChat}
          box={box}
          userProfileURL={userProfileURL}
          isJoiningThread={isJoiningThread}
          inputWarning={inputWarning}
        />
      );
    }

    return (
      <ChatWindow
        postMessage={this.postMessage}
        messageList={dialogue}
        likes={likes}
        agentProfile={agentProfile}
        loginFunction={loginFunction}
        isOpen={isOpen}
        showEmoji={showEmoji}
        profiles={profiles}
        currentUser3BoxProfile={currentUser3BoxProfile}
        currentUserAddr={currentUserAddr}
        colorTheme={colorTheme}
        mute={mute}
        membersOnlineLength={membersOnlineLength}
        membersOnline={membersOnline}
        ethereum={ethereum}
        noWeb3={noWeb3}
        userProfileURL={userProfileURL}
        isJoiningThread={isJoiningThread}
        box={box}
        popupChat={false}
        notPopup
        inputWarning={inputWarning}
      />
    )
  }
}

ChatBox.propTypes = {
  chatName: PropTypes.string,
  colorTheme: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  popupChat: PropTypes.bool,
  openOnMount: PropTypes.bool,
  mute: PropTypes.bool,
  currentUserAddr: PropTypes.string,
  userProfileURL: PropTypes.func,
  loginFunction: PropTypes.func,
  onUpdate: PropTypes.func,
  box: PropTypes.object,
  spaceOpts: PropTypes.object,
  agentProfile: PropTypes.object,
  ethereum: PropTypes.object,
  threadOpts: PropTypes.object,
  currentUser3BoxProfile: PropTypes.object,
  spaceName: PropTypes.string.isRequired,
  threadName: PropTypes.string.isRequired,
  showEmoji: PropTypes.bool,
};

ChatBox.defaultProps = {
  chatName: '',
  currentUserAddr: '',
  agentProfile: null,
  userProfileURL: null,
  box: null,
  ethereum: null,
  currentUser3BoxProfile: null,
  threadOpts: null,
  spaceOpts: null,
  loginFunction: null,
  onUpdate: null,
  showEmoji: true,
  openOnMount: false,
};

export default ChatBox;
